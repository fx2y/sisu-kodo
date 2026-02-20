import type { Pool } from "pg";
import type { WorkflowService } from "../workflow/port";
import { insertIntent } from "../db/intentRepo";
import { generateId } from "../lib/id";
import { startIntentRun } from "../workflow/start-intent";
import { findRunByIdOrWorkflowId, findRunSteps } from "../db/runRepo";
import { findArtifactsByRunId, findArtifactByUri } from "../db/artifactRepo";
import { projectRunHeader, projectStepRows } from "./run-view";
import { findGatesByRunId } from "../db/humanGateRepo";
import { projectGateView } from "./gate-view";
import { toHitlPromptKey, toHitlResultKey } from "../workflow/hitl/keys";
import { toHumanTopic } from "../lib/hitl-topic";
import type { GatePrompt } from "../contracts/hitl/gate-prompt.schema";
import type { GateResult } from "../contracts/hitl/gate-result.schema";
import { assertGateView, type GateView } from "../contracts/ui/gate-view.schema";
import { assertGateReply } from "../contracts/hitl/gate-reply.schema";

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

/**
 * Pure service layer for UI API endpoints.
 * Injected with Pool and WorkflowService to remain framework-agnostic.
 */

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
    if (dbosStatus) {
      const mapping: Record<string, RunHeaderStatus> = {
        PENDING: "ENQUEUED",
        ENQUEUED: "ENQUEUED",
        RUNNING: "PENDING",
        WAITING: "PENDING",
        SUCCESS: "SUCCESS",
        FAILURE: "ERROR",
        CANCELLED: "CANCELLED"
      };
      const mapped = mapping[dbosStatus];
      if (mapped) {
        header.status = mapped;
      }
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
      const view = projectGateView(run.workflow_id, gate.gate_key, prompt, result);
      assertGateView(view);
      views.push(view);
    }
  }

  return views;
}

export async function postReplyService(
  _pool: Pool,
  workflow: WorkflowService,
  workflowId: string,
  gateKey: string,
  payload: unknown
) {
  assertGateReply(payload);
  const topic = toHumanTopic(gateKey);
  await workflow.sendMessage(workflowId, payload.payload, topic, payload.dedupeKey);
}

export async function getArtifactService(pool: Pool, uri: string) {
  // uri might be a URI or a SHA or an ID. findArtifactByUri handles URIs.
  // We might need to support other lookups if the UI requests them.
  return findArtifactByUri(pool, uri);
}
