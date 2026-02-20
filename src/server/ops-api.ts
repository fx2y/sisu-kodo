import type { Pool } from "pg";
import type {
  WorkflowForkRequest,
  WorkflowOpsListQuery,
  WorkflowOpsStatus,
  WorkflowService
} from "../workflow/port";
import { insertArtifact } from "../db/artifactRepo";
import { buildArtifactUri } from "../lib/artifact-uri";
import { sha256 } from "../lib/hash";
import { nowIso } from "../lib/time";

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
  const taskKey = `op-intent:${tag.op}:${tag.at}`;
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

export async function listWorkflows(service: WorkflowService, query: WorkflowOpsListQuery) {
  return service.listWorkflows(query);
}

export async function getWorkflow(service: WorkflowService, workflowId: string) {
  return getWorkflowOrThrow(service, workflowId);
}

export async function getWorkflowSteps(service: WorkflowService, workflowId: string) {
  await getWorkflowOrThrow(service, workflowId);
  return service.listWorkflowSteps(workflowId);
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
