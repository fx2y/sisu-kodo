import type { Pool } from "pg";
import type { WorkflowService } from "../workflow/port";
import { insertIntent, upsertIntentByHash } from "../db/intentRepo";
import { generateId } from "../lib/id";
import { startIntentRun } from "../workflow/start-intent";
import { findRunByIdOrWorkflowId, findRunSteps } from "../db/runRepo";
import { findArtifactsByRunId, findArtifactByUri } from "../db/artifactRepo";
import { projectRunHeader, projectStepRows } from "./run-view";
import {
  findGatesByRunId,
  findHumanGate,
  findLatestGateByRunId,
  insertHumanInteraction
} from "../db/humanGateRepo";
import { projectGateView } from "./gate-view";
import { toHitlPromptKey, toHitlResultKey } from "../workflow/hitl/keys";
import { toHumanTopic } from "../lib/hitl-topic";
import type { GatePrompt } from "../contracts/hitl/gate-prompt.schema";
import type { GateResult } from "../contracts/hitl/gate-result.schema";
import { assertGateView, type GateView } from "../contracts/ui/gate-view.schema";
import { assertGateReply } from "../contracts/hitl/gate-reply.schema";
import { assertGatePrompt } from "../contracts/hitl/gate-prompt.schema";
import { assertGateResult } from "../contracts/hitl/gate-result.schema";
import { assertGateKey } from "../contracts/hitl/gate-key.schema";

import { assertIntent } from "../contracts/intent.schema";
import { assertRunRequest } from "../contracts/run-request.schema";
import {
  assertRunHeader,
  type RunHeader,
  type RunHeaderStatus
} from "../contracts/ui/run-header.schema";
import { assertStepRow, type StepRow } from "../contracts/ui/step-row.schema";
import { getConfig } from "../config";

import { findIntentById } from "../db/intentRepo";
import type { RunRow } from "../db/runRepo";
import type { PlanApprovalRequest } from "../contracts/plan-approval.schema";
import { assertRunStartRequest } from "../contracts/run-start.schema";
import { findVersion } from "../db/recipeRepo";
import { instantiateIntent } from "../intent-compiler/instantiate-intent";
import { canonicalStringify, sha256 } from "../lib/hash";

import { assertExternalEvent } from "../contracts/hitl/external-event.schema";
import { OpsConflictError, OpsNotFoundError } from "./ops-api";

import { buildGateKey } from "../workflow/hitl/gate-key";
import { buildLegacyHitlDedupeKey } from "../workflow/hitl/dedupe-key";

const DBOS_TO_HEADER_STATUS: Record<string, RunHeaderStatus> = {
  PENDING: "ENQUEUED",
  ENQUEUED: "ENQUEUED",
  RUNNING: "PENDING",
  WAITING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILURE: "ERROR",
  CANCELLED: "CANCELLED"
};

const HEADER_STATUS_RANK: Record<RunHeaderStatus, number> = {
  ENQUEUED: 1,
  PENDING: 2,
  SUCCESS: 3,
  ERROR: 3,
  CANCELLED: 3
};

const TERMINAL_RUN_STATUSES = new Set<RunRow["status"]>([
  "succeeded",
  "failed",
  "retries_exceeded",
  "canceled"
]);

function toHitlDedupeConflict(err: unknown, dedupeKey: string): never {
  if (err instanceof Error && err.message.includes("dedupeKey conflict")) {
    throw new OpsConflictError(`dedupeKey conflict for ${dedupeKey}`);
  }
  throw err;
}

export function mergeRunHeaderStatusWithDbos(
  durableStatus: RunHeaderStatus,
  dbosStatus: string | undefined
): RunHeaderStatus {
  if (!dbosStatus) return durableStatus;
  const mapped = DBOS_TO_HEADER_STATUS[dbosStatus];
  if (!mapped) return durableStatus;
  if (mapped === durableStatus) return durableStatus;

  const durableRank = HEADER_STATUS_RANK[durableStatus];
  const mappedRank = HEADER_STATUS_RANK[mapped];

  // Allow only monotonic progression (no downgrade) and keep durable winner on equal rank.
  if (mappedRank <= durableRank) return durableStatus;
  return mapped;
}

export async function forwardPlanApprovalSignalService(
  pool: Pool,
  workflow: WorkflowService,
  run: RunRow,
  payload: PlanApprovalRequest
): Promise<boolean> {
  if (TERMINAL_RUN_STATUSES.has(run.status)) return false;

  const latestGate = await findLatestGateByRunId(pool, run.id);
  const gateKey = latestGate?.gate_key || buildGateKey(run.id, "ApplyPatchST", "approve-plan", 1);
  const topic = latestGate?.topic || toHumanTopic(gateKey);
  const message = { approved: true, ...payload };
  const dedupeKey = buildLegacyHitlDedupeKey({
    origin: "legacy-approve",
    workflowId: run.workflow_id,
    runId: run.id,
    gateKey,
    topic,
    payload: message
  });

  await workflow.sendMessage(run.workflow_id, message, topic, dedupeKey);
  return true;
}

/**
 * Pure service layer for UI API endpoints.
 * Injected with Pool and WorkflowService to remain framework-agnostic.
 */

export async function postExternalEventService(
  pool: Pool,
  workflow: WorkflowService,
  payload: unknown
) {
  assertExternalEvent(payload);
  const event = payload;
  assertGateKey(event.gateKey);
  if (event.topic.startsWith("human:") && event.topic !== toHumanTopic(event.gateKey)) {
    throw new OpsConflictError(`topic/gate mismatch for ${event.gateKey}`);
  }

  const run = await findRunByIdOrWorkflowId(pool, event.workflowId);
  if (!run) {
    throw new OpsNotFoundError(event.workflowId);
  }
  const gate = await findHumanGate(pool, run.id, event.gateKey);
  if (!gate) {
    throw new OpsNotFoundError(`${event.workflowId}/gates/${event.gateKey}`);
  }
  if (run.status !== "waiting_input") {
    throw new OpsConflictError(`run not waiting for input: ${run.status}`);
  }
  if (event.topic.startsWith("human:") && gate.topic !== event.topic) {
    throw new OpsConflictError(`topic/gate mismatch for ${event.gateKey}`);
  }

  const payloadHash = sha256(event.payload);

  // Exactly-once recording in interaction ledger (Learning L22/L28)
  const { inserted, interaction } = await insertHumanInteraction(pool, {
    workflowId: event.workflowId,
    runId: run.id,
    gateKey: event.gateKey,
    topic: event.topic,
    dedupeKey: event.dedupeKey,
    payloadHash,
    payload: event.payload,
    origin: event.origin
  }).catch((err) => toHitlDedupeConflict(err, event.dedupeKey));

  if (
    !inserted &&
    (interaction.payload_hash !== payloadHash || interaction.topic !== event.topic)
  ) {
    throw new OpsConflictError(`dedupeKey conflict: different payload/topic for ${event.dedupeKey}`);
  }

  // GAP S0.01: Always send (it's idempotent in DBOS) to prevent blackhole on transient failure.
  await workflow.sendMessage(event.workflowId, event.payload, event.topic, event.dedupeKey);
}

export async function createIntentService(pool: Pool, payload: unknown) {
  assertIntent(payload);
  const id = generateId("it");
  const intent = await insertIntent(pool, id, payload);
  return { intentId: intent.id };
}

export async function startRunService(
  pool: Pool,
  workflow: WorkflowService,
  intentId: string,
  payload: unknown
) {
  assertRunRequest(payload);

  const intent = await findIntentById(pool, intentId);
  if (!intent) {
    throw new Error(`Intent not found: ${intentId}`);
  }

  const { runId, workflowId } = await startIntentRun(pool, workflow, intentId, payload);
  const run = await findRunByIdOrWorkflowId(pool, runId);
  if (!run) throw new Error("Run not found after start");
  const cfg = getConfig();
  const header = projectRunHeader(run, { traceBaseUrl: cfg.traceBaseUrl });
  assertRunHeader(header);
  return { runId, workflowId, header };
}

export async function startRunFromRecipeService(
  pool: Pool,
  workflow: WorkflowService,
  payload: unknown
) {
  assertRunStartRequest(payload);
  const recipeVersion = await findVersion(pool, payload.recipeRef);
  if (!recipeVersion) {
    throw new OpsNotFoundError(`Recipe not found: ${payload.recipeRef.id}@${payload.recipeRef.v}`);
  }

  const intent = instantiateIntent(recipeVersion.json, payload.formData);
  const intentJson = canonicalStringify(intent);
  const intentHash = sha256(intentJson);
  const intentId = `ih_${intentHash}`;

  await upsertIntentByHash(pool, {
    id: intentId,
    intentHash,
    intent,
    recipeRef: payload.recipeRef,
    recipeHash: recipeVersion.hash
  });

  const runRequest = {
    ...(payload.opts ?? {}),
    recipeName: payload.recipeRef.id,
    deduplicationID: intentHash
  };

  const { runId, workflowId } = await startIntentRun(pool, workflow, intentId, runRequest);
  const run = await findRunByIdOrWorkflowId(pool, runId);
  if (!run) throw new Error("Run not found after start");
  const cfg = getConfig();
  const header = projectRunHeader(run, { traceBaseUrl: cfg.traceBaseUrl });
  header.recipeRef = payload.recipeRef;
  header.recipeHash = recipeVersion.hash;
  header.intentHash = intentHash;
  assertRunHeader(header);
  return { runId, workflowId, header };
}

export async function getRunHeaderService(
  pool: Pool,
  workflow: WorkflowService,
  workflowId: string
): Promise<RunHeader | null> {
  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) return null;

  const cfg = getConfig();
  const header = projectRunHeader(run, { traceBaseUrl: cfg.traceBaseUrl });

  try {
    const dbosStatus = await workflow.getWorkflowStatus(run.workflow_id);
    header.status = mergeRunHeaderStatusWithDbos(header.status, dbosStatus);
  } catch {
    // DB status remains the durable fallback.
  }

  assertRunHeader(header);
  return header;
}

export async function getStepRowsService(
  pool: Pool,
  workflow: WorkflowService,
  workflowId: string
): Promise<StepRow[]> {
  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) return [];

  const [dbosSteps, dbSteps, artifacts] = await Promise.all([
    workflow.listWorkflowSteps(run.workflow_id).catch(() => []),
    findRunSteps(pool, run.id),
    findArtifactsByRunId(pool, run.id)
  ]);

  const projected = projectStepRows(dbSteps, artifacts, run.workflow_id);

  // Overlay DBOS status for steps that are not yet in app.run_steps (completed)
  // Or handle steps that are in DBOS but not in DB yet
  const projectedIds = new Set(projected.map((s) => s.stepID));

  for (const dbosStep of dbosSteps) {
    if (!projectedIds.has(dbosStep.stepId)) {
      projected.push({
        stepID: dbosStep.stepId,
        name: dbosStep.stepId, // fallback name
        attempt: 1,
        startedAt: dbosStep.startedAt ?? run.created_at.getTime(),
        artifactRefs: [],
        traceId: null,
        spanId: null
      });
    }
  }

  projected.sort((a, b) => a.startedAt - b.startedAt || a.stepID.localeCompare(b.stepID));

  for (const step of projected) {
    assertStepRow(step);
  }
  return projected;
}

export async function getGateService(
  pool: Pool,
  workflow: WorkflowService,
  workflowId: string,
  gateKey: string,
  timeoutS = 0.1
): Promise<GateView | null> {
  assertGateKey(gateKey);
  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) return null;

  const gate = await findHumanGate(pool, run.id, gateKey);
  if (!gate) return null;

  const promptKey = toHitlPromptKey(gate.gate_key);
  const resultKey = toHitlResultKey(gate.gate_key);

  const [prompt, result] = await Promise.all([
    workflow.getEvent<GatePrompt>(run.workflow_id, promptKey, timeoutS),
    workflow.getEvent<GateResult>(run.workflow_id, resultKey, timeoutS)
  ]);

  if (!prompt) return null;

  // GAP S1.02: Enforce strict egress validation
  assertGatePrompt(prompt);
  if (result) assertGateResult(result);

  const view = projectGateView(run.workflow_id, gate.gate_key, prompt, result);
  assertGateView(view);
  return view;
}

export async function getGatesService(
  pool: Pool,
  workflow: WorkflowService,
  workflowId: string
): Promise<GateView[]> {
  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) return [];

  const gates = await findGatesByRunId(pool, run.id);
  const views: GateView[] = [];

  for (const gate of gates) {
    const promptKey = toHitlPromptKey(gate.gate_key);
    const resultKey = toHitlResultKey(gate.gate_key);

    const [prompt, result] = await Promise.all([
      workflow.getEvent<GatePrompt>(run.workflow_id, promptKey, 0.1),
      workflow.getEvent<GateResult>(run.workflow_id, resultKey, 0.1)
    ]);

    if (prompt) {
      assertGatePrompt(prompt);
      if (result) assertGateResult(result);

      const view = projectGateView(run.workflow_id, gate.gate_key, prompt, result);
      assertGateView(view);
      views.push(view);
    }
  }

  return views;
}

export async function postReplyService(
  pool: Pool,
  workflow: WorkflowService,
  workflowId: string,
  gateKey: string,
  payload: unknown
) {
  assertGateKey(gateKey);
  assertGateReply(payload);
  const reply = payload;

  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) {
    throw new OpsNotFoundError(workflowId);
  }

  // GAP S0.03: Validate gateKey exists at ingress
  const gate = await findHumanGate(pool, run.id, gateKey);
  if (!gate) {
    throw new OpsNotFoundError(`${workflowId}/gates/${gateKey}`);
  }
  if (run.status !== "waiting_input") {
    throw new OpsConflictError(`run not waiting for input: ${run.status}`);
  }

  const expectedTopic = toHumanTopic(gate.gate_key);
  if (gate.topic !== expectedTopic) {
    throw new OpsConflictError(`gate topic mismatch for ${gateKey}`);
  }
  const topic = gate.topic;
  const payloadHash = sha256(reply.payload);

  // Exactly-once recording in interaction ledger (Learning L22)
  const { inserted, interaction } = await insertHumanInteraction(pool, {
    workflowId,
    runId: run.id,
    gateKey,
    topic,
    dedupeKey: reply.dedupeKey,
    payloadHash,
    payload: reply.payload,
    origin: reply.origin
  }).catch((err) => toHitlDedupeConflict(err, reply.dedupeKey));

  if (!inserted && (interaction.payload_hash !== payloadHash || interaction.topic !== topic)) {
    throw new OpsConflictError(`dedupeKey conflict: different payload/topic for ${reply.dedupeKey}`);
  }

  // GAP S0.01: Always send (it's idempotent in DBOS) to prevent blackhole on transient failure.
  await workflow.sendMessage(workflowId, reply.payload, topic, reply.dedupeKey);
}

export async function getArtifactService(pool: Pool, uri: string) {
  // uri might be a URI or a SHA or an ID. findArtifactByUri handles URIs.
  // We might need to support other lookups if the UI requests them.
  return findArtifactByUri(pool, uri);
}

export function getStreamService(
  workflow: WorkflowService,
  workflowId: string,
  streamKey: string
): AsyncIterable<unknown> {
  return workflow.readStream(workflowId, streamKey);
}
