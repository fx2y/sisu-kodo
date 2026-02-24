import type { Pool } from "pg";
import type { WorkflowService } from "../workflow/port";
import { insertIntent, upsertIntentByHash } from "../db/intentRepo";
import { generateId } from "../lib/id";
import { generateReproSnapshot } from "../lib/repro";
import { startIntentRun } from "../workflow/start-intent";
import { findRunByIdOrWorkflowId, findRunSteps } from "../db/runRepo";
import { findArtifactsByRunId, findArtifactByUri } from "../db/artifactRepo";
import { assertProofCard, type ProofCard } from "../contracts/ui/proof-card.schema";
import { projectProofCards, projectRunHeader, projectStepRows } from "./run-view";
import {
  findGatesByRunId,
  findHumanGate,
  findLatestGateByRunId,
  findLatestInteractionByGate,
  findLatestInteractionsByRunId,
  listHumanInteractionsByWorkflowId,
  listPendingHumanGates,
  insertHumanInteraction
} from "../db/humanGateRepo";
import { projectGateView } from "./gate-view";
import { toHitlDecisionKey, toHitlPromptKey, toHitlResultKey } from "../workflow/hitl/keys";
import { toHumanTopic } from "../lib/hitl-topic";
import type { GatePrompt } from "../contracts/hitl/gate-prompt.schema";
import type { GateResult } from "../contracts/hitl/gate-result.schema";
import type { GateDecision } from "../contracts/hitl/gate-decision.schema";
import { assertGateView, type GateView } from "../contracts/ui/gate-view.schema";
import { assertGateReply } from "../contracts/hitl/gate-reply.schema";
import { assertGatePrompt } from "../contracts/hitl/gate-prompt.schema";
import { assertGateResult } from "../contracts/hitl/gate-result.schema";
import { assertGateKey } from "../contracts/hitl/gate-key.schema";
import {
  assertHitlInteractionRow,
  type HitlInteractionRow
} from "../contracts/ui/hitl-interaction-row.schema";
import { assertHitlInboxRow, type HitlInboxRow } from "../contracts/ui/hitl-inbox-row.schema";

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
  WAITING: "WAITING_INPUT",
  SUCCESS: "SUCCESS",
  FAILURE: "ERROR",
  CANCELLED: "CANCELLED"
};

const HEADER_STATUS_RANK: Record<RunHeaderStatus, number> = {
  ENQUEUED: 1,
  PENDING: 2,
  WAITING_INPUT: 3,
  SUCCESS: 4,
  ERROR: 4,
  CANCELLED: 4
};

const TERMINAL_RUN_STATUSES = new Set<RunRow["status"]>([
  "succeeded",
  "failed",
  "retries_exceeded",
  "canceled"
]);

const UI_ORIGIN_SET = new Set<string>([
  "manual",
  "engine-dbos",
  "api-shim",
  "legacy-event",
  "poller-ci",
  "legacy-approve",
  "webhook",
  "webhook-ci",
  "external",
  "unknown"
]);

function toHitlDedupeConflict(err: unknown, dedupeKey: string): never {
  if (err instanceof Error && err.message.includes("dedupeKey conflict")) {
    throw new OpsConflictError(`dedupeKey conflict for ${dedupeKey}`);
  }
  throw err;
}

function toUiOrigin(value: string | null | undefined): GateView["origin"] {
  if (!value) return "unknown";
  return UI_ORIGIN_SET.has(value) ? (value as GateView["origin"]) : "unknown";
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

function getPostureOpts() {
  const cfg = getConfig();
  return {
    traceBaseUrl: cfg.traceBaseUrl,
    topology: cfg.workflowRuntimeMode,
    runtimeMode: cfg.workflowRuntimeMode,
    ocMode: cfg.ocMode,
    sbxMode: cfg.sbxMode,
    sbxProvider: cfg.sbxProvider,
    appVersion: cfg.appVersion,
    claimScope: cfg.claimScope,
    ocStrictMode: cfg.ocStrictMode
  };
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
    throw new OpsConflictError(
      `dedupeKey conflict: different payload/topic for ${event.dedupeKey}`
    );
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

  const { runId, workflowId, isReplay } = await startIntentRun(pool, workflow, intentId, payload);
  const run = await findRunByIdOrWorkflowId(pool, runId);
  if (!run) throw new Error("Run not found after start");
  const header = projectRunHeader(run, getPostureOpts());
  assertRunHeader(header);
  return { runId, workflowId, header, isReplay };
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

  const { recipeVersion: _ignoredRecipeVersion, ...runOpts } = payload.opts ?? {};
  const runRequest = {
    ...runOpts,
    recipeName: payload.recipeRef.id,
    deduplicationID: intentHash
  };

  const { runId, workflowId, isReplay } = await startIntentRun(
    pool,
    workflow,
    intentId,
    runRequest,
    {
      recipeRef: payload.recipeRef
    }
  );
  const run = await findRunByIdOrWorkflowId(pool, runId);
  if (!run) throw new Error("Run not found after start");
  const header = projectRunHeader(run, getPostureOpts());
  header.recipeRef = payload.recipeRef;
  header.recipeHash = recipeVersion.hash;
  header.intentHash = intentHash;
  assertRunHeader(header);
  return { runId, workflowId, header, isReplay };
}

export async function getRunHeaderService(
  pool: Pool,
  workflow: WorkflowService,
  workflowId: string
): Promise<RunHeader | null> {
  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) return null;

  const header = projectRunHeader(run, getPostureOpts());

  try {
    const dbosSummary = await workflow.getWorkflow(run.workflow_id);
    if (dbosSummary) {
      header.status = mergeRunHeaderStatusWithDbos(header.status, dbosSummary.status);
      header.workflowVersion = dbosSummary.applicationVersion ?? null;
    }
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
  const decisionKey = toHitlDecisionKey(gate.gate_key);

  const [prompt, result, decision, interaction] = await Promise.all([
    workflow.getEvent<GatePrompt>(run.workflow_id, promptKey, timeoutS),
    workflow.getEvent<GateResult>(run.workflow_id, resultKey, timeoutS),
    workflow.getEvent<GateDecision>(run.workflow_id, decisionKey, timeoutS),
    findLatestInteractionByGate(pool, run.workflow_id, gate.gate_key)
  ]);

  if (!prompt) return null;

  // GAP S1.02: Enforce strict egress validation
  assertGatePrompt(prompt);
  if (result) assertGateResult(result);

  const view = projectGateView(
    run.workflow_id,
    {
      gateKey: gate.gate_key,
      topic: gate.topic,
      createdAt: gate.created_at.getTime()
    },
    prompt,
    result,
    decision,
    interaction
      ? {
          origin: toUiOrigin(interaction.origin),
          payloadHash: interaction.payload_hash
        }
      : null
  );
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
  const latestInteractions = await findLatestInteractionsByRunId(pool, run.id);
  const interactionByGate = new Map(latestInteractions.map((entry) => [entry.gate_key, entry]));
  const views: GateView[] = [];

  for (const gate of gates) {
    const promptKey = toHitlPromptKey(gate.gate_key);
    const resultKey = toHitlResultKey(gate.gate_key);
    const decisionKey = toHitlDecisionKey(gate.gate_key);

    const [prompt, result, decision] = await Promise.all([
      workflow.getEvent<GatePrompt>(run.workflow_id, promptKey, 0.1),
      workflow.getEvent<GateResult>(run.workflow_id, resultKey, 0.1),
      workflow.getEvent<GateDecision>(run.workflow_id, decisionKey, 0.1)
    ]);

    if (prompt) {
      assertGatePrompt(prompt);
      if (result) assertGateResult(result);
      const interaction = interactionByGate.get(gate.gate_key);
      const view = projectGateView(
        run.workflow_id,
        {
          gateKey: gate.gate_key,
          topic: gate.topic,
          createdAt: gate.created_at.getTime()
        },
        prompt,
        result,
        decision,
        interaction
          ? {
              origin: toUiOrigin(interaction.origin),
              payloadHash: interaction.payload_hash
            }
          : null
      );
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
    workflowId: run.workflow_id,
    runId: run.id,
    gateKey,
    topic,
    dedupeKey: reply.dedupeKey,
    payloadHash,
    payload: reply.payload,
    origin: reply.origin
  }).catch((err) => toHitlDedupeConflict(err, reply.dedupeKey));

  if (!inserted && (interaction.payload_hash !== payloadHash || interaction.topic !== topic)) {
    throw new OpsConflictError(
      `dedupeKey conflict: different payload/topic for ${reply.dedupeKey}`
    );
  }

  // GAP S0.01: Always send (it's idempotent in DBOS) to prevent blackhole on transient failure.
  await workflow.sendMessage(run.workflow_id, reply.payload, topic, reply.dedupeKey);
  return { isReplay: !inserted };
}

export async function getHitlInteractionsService(
  pool: Pool,
  workflowId: string,
  limit = 200
): Promise<HitlInteractionRow[]> {
  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) return [];
  const rows = await listHumanInteractionsByWorkflowId(pool, run.workflow_id, limit);
  const projected = rows.map((row) => {
    const item: HitlInteractionRow = {
      workflowID: row.workflow_id,
      gateKey: row.gate_key,
      topic: row.topic,
      dedupeKey: row.dedupe_key,
      payloadHash: row.payload_hash,
      origin: toUiOrigin(row.origin) as HitlInteractionRow["origin"],
      createdAt: row.created_at.getTime()
    };
    assertHitlInteractionRow(item);
    return item;
  });
  return projected;
}

import { nowMs } from "../lib/time";

export async function getHitlInboxService(
  pool: Pool,
  workflow: WorkflowService,
  limit = 100
): Promise<HitlInboxRow[]> {
  const pending = await listPendingHumanGates(pool, limit);
  const rows = await Promise.all(
    pending.map(async (row) => {
      const prompt = await workflow.getEvent<GatePrompt>(
        row.workflow_id,
        toHitlPromptKey(row.gate_key),
        0
      );
      if (prompt) {
        assertGatePrompt(prompt);
      }
      const deadline = prompt?.deadlineAt ?? null;
      const now = nowMs();
      const msToDeadline = deadline === null ? Number.POSITIVE_INFINITY : deadline - now;
      const slaStatus: HitlInboxRow["slaStatus"] =
        msToDeadline <= 0 ? "CRITICAL" : msToDeadline <= 60_000 ? "WARNING" : "NORMAL";
      const escalationWorkflowID = `esc:${row.workflow_id}:${row.gate_key}`;
      const escalationStatus = await workflow
        .getWorkflowStatus(escalationWorkflowID)
        .catch(() => undefined);
      const projected: HitlInboxRow = {
        workflowID: row.workflow_id,
        gateKey: row.gate_key,
        topic: row.topic,
        deadline,
        slaStatus,
        escalationWorkflowID: escalationStatus ? escalationWorkflowID : null,
        mismatchRisk: row.topic !== toHumanTopic(row.gate_key),
        createdAt: row.created_at.getTime()
      };
      assertHitlInboxRow(projected);
      return projected;
    })
  );
  rows.sort((a, b) => {
    const aDeadline = a.deadline ?? Number.POSITIVE_INFINITY;
    const bDeadline = b.deadline ?? Number.POSITIVE_INFINITY;
    return (
      aDeadline - bDeadline || a.createdAt - b.createdAt || a.workflowID.localeCompare(b.workflowID)
    );
  });
  return rows;
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

export async function getProofCardsService(
  pool: Pool,
  workflow: WorkflowService,
  workflowId: string
): Promise<ProofCard[]> {
  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) return [];

  const [steps, artifacts, dbosSummary] = await Promise.all([
    findRunSteps(pool, run.id),
    findArtifactsByRunId(pool, run.id),
    workflow.getWorkflow(run.workflow_id).catch(() => undefined)
  ]);

  const dbosStatus = dbosSummary
    ? {
        status: dbosSummary.status,
        updatedAt: dbosSummary.updatedAt ?? nowMs()
      }
    : undefined;

  const cards = projectProofCards(run, steps, artifacts, dbosStatus);
  for (const card of cards) {
    assertProofCard(card);
  }
  return cards;
}

import {
  assertRecipeRegistryRow,
  assertRecipeRegistryVersionRow,
  type RecipeRegistryRow,
  type RecipeRegistryVersionRow
} from "../contracts/ui/recipe-registry.schema";
import { listRecipeOverviews, listRecipeVersions } from "../db/recipeRepo";

export async function getRecipeOverviewsService(pool: Pool): Promise<RecipeRegistryRow[]> {
  const rows = await listRecipeOverviews(pool);
  const projected = rows.map((row) => ({
    id: row.id,
    name: row.name,
    latestV: row.latest_v,
    status: row.status,
    updatedAt: row.updated_at.getTime()
  }));
  for (const row of projected) {
    assertRecipeRegistryRow(row);
  }
  return projected;
}

export async function getRecipeVersionsService(
  pool: Pool,
  id: string
): Promise<RecipeRegistryVersionRow[]> {
  const rows = await listRecipeVersions(pool, id);
  const projected = rows.map((row) => ({
    id: row.id,
    v: row.v,
    hash: row.hash,
    status: row.status,
    createdAt: row.created_at.getTime(),
    evalCount: Array.isArray(row.json.eval) ? row.json.eval.length : 0,
    fixtureCount: Array.isArray(row.json.fixtures) ? row.json.fixtures.length : 0
  }));
  for (const row of projected) {
    assertRecipeRegistryVersionRow(row);
  }
  return projected;
}

import { listPatchHistoryByStep } from "../db/patchHistoryRepo";

export type PatchReviewRow = {
  patchIndex: number;
  targetPath: string;
  preimageHash: string;
  postimageHash: string;
  diffHash: string;
  appliedAt: number | null;
  rolledBackAt: number | null;
  createdAt: number;
};

export async function getPatchHistoryService(
  pool: Pool,
  runId: string,
  stepId: string
): Promise<PatchReviewRow[]> {
  const rows = await listPatchHistoryByStep(pool, runId, stepId);
  return rows.map((row) => ({
    patchIndex: row.patch_index,
    targetPath: row.target_path,
    preimageHash: row.preimage_hash,
    postimageHash: row.postimage_hash,
    diffHash: row.diff_hash,
    appliedAt: row.applied_at?.getTime() ?? null,
    rolledBackAt: row.rolled_back_at?.getTime() ?? null,
    createdAt: row.created_at.getTime()
  }));
}

export async function getReproSnapshotService(appPool: Pool, sysPool: Pool, workflowId: string) {
  const cfg = getConfig();
  return generateReproSnapshot(appPool, sysPool, workflowId, {
    appDbName: cfg.appDbName,
    sysDbName: cfg.sysDbName
  });
}
