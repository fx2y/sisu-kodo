import type { Pool } from "pg";
import type {
  WorkflowForkRequest,
  WorkflowOpsListQuery,
  WorkflowOpsSummary,
  WorkflowOpsStatus,
  WorkflowService
} from "../workflow/port";
import type { QueueDepthQuery, QueueDepthRow } from "../contracts/ops/queue-depth.schema";
import { insertArtifact } from "../db/artifactRepo";
import { buildArtifactUri } from "../lib/artifact-uri";
import { sha256 } from "../lib/hash";
import { nowIso } from "../lib/time";
import { ensureUtilitySleepRunContext } from "../db/utilityWorkflowRepo";

export type OpsActionAck = {
  accepted: true;
  workflowID: string;
};

export type OpsForkAck = {
  accepted: true;
  workflowID: string;
  forkedWorkflowID: string;
};

export type OpIntentTag = {
  op: string;
  actor?: string;
  reason?: string;
  targetWorkflowID: string;
  at: string;
  forkedWorkflowID?: string;
};

const cancellableStatuses = new Set<WorkflowOpsStatus>(["PENDING", "ENQUEUED"]);
const resumableStatuses = new Set<WorkflowOpsStatus>(["CANCELLED", "ENQUEUED"]);
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 200;
let opIntentDisambiguator = 0;

export class OpsNotFoundError extends Error {
  constructor(workflowID: string) {
    super(`workflow not found: ${workflowID}`);
    this.name = "OpsNotFoundError";
  }
}

export class OpsConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpsConflictError";
  }
}

function isForkStepConflict(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "DBOSInvalidStepIDError") {
    return true;
  }
  return error.message.toLowerCase().includes("step");
}

async function getWorkflowOrThrow(service: WorkflowService, workflowID: string) {
  const workflow = await service.getWorkflow(workflowID);
  if (!workflow) {
    throw new OpsNotFoundError(workflowID);
  }
  return workflow;
}

async function resolveRunIdForOpIntent(pool: Pool, workflowID: string): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id
       FROM app.runs
      WHERE workflow_id = $1 OR id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [workflowID]
  );
  if ((existing.rowCount ?? 0) > 0) {
    return existing.rows[0].id;
  }

  const intentId = `it-ops-${workflowID}`;
  await pool.query(
    "INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [intentId, "ops-workflow-control", JSON.stringify({ inputs: {}, constraints: {} })]
  );
  await pool.query(
    "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    [workflowID, intentId, workflowID, "running"]
  );
  return workflowID;
}

function nextOpIntentDisambiguator(): string {
  opIntentDisambiguator += 1;
  return `${process.pid}-${opIntentDisambiguator.toString().padStart(6, "0")}`;
}

function buildOpIntentTaskKey(tag: OpIntentTag): string {
  const semanticHash = sha256({
    op: tag.op,
    targetWorkflowID: tag.targetWorkflowID,
    actor: tag.actor ?? null,
    reason: tag.reason ?? null,
    forkedWorkflowID: tag.forkedWorkflowID ?? null
  });
  return `op-intent:${tag.op}:${semanticHash}:${nextOpIntentDisambiguator()}`;
}

/**
 * Persist operator intent as a durable artifact (kind=json_diagnostic, step_id=OPS, idx=0).
 * ON CONFLICT DO NOTHING ensures exactly-once semantics.
 */
async function persistOpIntent(pool: Pool, tag: OpIntentTag): Promise<void> {
  const payload: Record<string, unknown> = {
    op: tag.op,
    targetWorkflowID: tag.targetWorkflowID,
    at: tag.at
  };
  if (tag.actor !== undefined) payload.actor = tag.actor;
  if (tag.reason !== undefined) payload.reason = tag.reason;
  if (tag.forkedWorkflowID !== undefined) payload.forkedWorkflowID = tag.forkedWorkflowID;

  const digest = sha256(payload);
  const runId = await resolveRunIdForOpIntent(pool, tag.targetWorkflowID);
  const taskKey = buildOpIntentTaskKey(tag);
  const uri = buildArtifactUri({
    runId,
    stepId: "OPS",
    taskKey,
    name: `op-intent-${tag.op}.json`
  });
  await insertArtifact(
    pool,
    runId,
    "OPS",
    0,
    { kind: "json_diagnostic", uri, inline: payload, sha256: digest },
    taskKey,
    1
  );
}

function normalizeListLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_LIST_LIMIT, limit));
}

function sortWorkflowSummaries(rows: WorkflowOpsSummary[]): WorkflowOpsSummary[] {
  return [...rows].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return b.createdAt - a.createdAt;
    }
    if (a.workflowID !== b.workflowID) {
      return a.workflowID.localeCompare(b.workflowID);
    }
    return a.status.localeCompare(b.status);
  });
}

export async function listWorkflows(service: WorkflowService, query: WorkflowOpsListQuery) {
  const limit = normalizeListLimit(query.limit);
  const rows = await service.listWorkflows({ ...query, limit });
  return sortWorkflowSummaries(rows).slice(0, limit);
}

type QueueDepthSqlRow = {
  queue_name: string;
  status: "ENQUEUED" | "PENDING";
  workflow_count: string;
  oldest_created_at: string | number | null;
  newest_created_at: string | number | null;
};

function toOptionalNumber(value: string | number | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function listQueueDepth(pool: Pool, query: QueueDepthQuery): Promise<QueueDepthRow[]> {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (query.queueName) {
    params.push(query.queueName);
    where.push(`queue_name = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }

  const limit = query.limit ?? 20;
  params.push(limit);
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const result = await pool.query<QueueDepthSqlRow>(
    `SELECT queue_name,status,workflow_count,oldest_created_at,newest_created_at
       FROM app.v_ops_queue_depth
       ${whereClause}
      ORDER BY queue_name ASC, status ASC
      LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({
    queueName: row.queue_name,
    status: row.status,
    workflowCount: Number(row.workflow_count),
    oldestCreatedAt: toOptionalNumber(row.oldest_created_at),
    newestCreatedAt: toOptionalNumber(row.newest_created_at)
  }));
}

export async function getWorkflow(service: WorkflowService, workflowId: string) {
  return getWorkflowOrThrow(service, workflowId);
}

export async function getWorkflowSteps(service: WorkflowService, workflowId: string) {
  await getWorkflowOrThrow(service, workflowId);
  return service.listWorkflowSteps(workflowId);
}

export async function startSleepWorkflow(
  service: WorkflowService,
  pool: Pool,
  workflowID: string,
  sleepMs: number
): Promise<OpsActionAck> {
  await ensureUtilitySleepRunContext(pool, workflowID);
  await service.startSleepWorkflow(workflowID, sleepMs);
  return { accepted: true, workflowID };
}

export async function cancelWorkflow(
  service: WorkflowService,
  workflowId: string,
  pool?: Pool,
  actor?: string,
  reason?: string
): Promise<OpsActionAck> {
  const workflow = await getWorkflowOrThrow(service, workflowId);
  if (!cancellableStatuses.has(workflow.status)) {
    throw new OpsConflictError(`cannot cancel workflow in status ${workflow.status}`);
  }
  await service.cancelWorkflow(workflowId);
  if (pool) {
    await persistOpIntent(pool, {
      op: "cancel",
      actor,
      reason,
      targetWorkflowID: workflowId,
      at: nowIso()
    });
  }
  return { accepted: true, workflowID: workflowId };
}

export async function resumeWorkflow(
  service: WorkflowService,
  workflowId: string,
  pool?: Pool,
  actor?: string,
  reason?: string
): Promise<OpsActionAck> {
  const workflow = await getWorkflowOrThrow(service, workflowId);
  if (!resumableStatuses.has(workflow.status)) {
    throw new OpsConflictError(`cannot resume workflow in status ${workflow.status}`);
  }
  await service.resumeWorkflow(workflowId);
  if (pool) {
    await persistOpIntent(pool, {
      op: "resume",
      actor,
      reason,
      targetWorkflowID: workflowId,
      at: nowIso()
    });
  }
  return { accepted: true, workflowID: workflowId };
}

export async function forkWorkflow(
  service: WorkflowService,
  workflowId: string,
  request: WorkflowForkRequest,
  pool?: Pool,
  actor?: string,
  reason?: string
): Promise<OpsForkAck> {
  await getWorkflowOrThrow(service, workflowId);

  // G07.S0.03: Upper-bound guard for fork-after-fix logic
  const steps = await service.listWorkflowSteps(workflowId);
  const maxStep = Math.max(0, ...steps.map((s) => s.functionId));
  if (request.stepN > maxStep) {
    throw new OpsConflictError(`fork stepN ${request.stepN} exceeds max step ${maxStep}`);
  }

  try {
    const forked = await service.forkWorkflow(workflowId, request);
    if (pool) {
      await persistOpIntent(pool, {
        op: "fork",
        actor,
        reason,
        targetWorkflowID: workflowId,
        at: nowIso(),
        forkedWorkflowID: forked.workflowID
      });
    }
    return {
      accepted: true,
      workflowID: workflowId,
      forkedWorkflowID: forked.workflowID
    };
  } catch (error) {
    if (isForkStepConflict(error)) {
      throw new OpsConflictError(
        error instanceof Error ? error.message : "fork conflict: invalid step"
      );
    }
    throw error;
  }
}
