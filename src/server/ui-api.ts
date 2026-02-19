import type { Pool } from "pg";
import type { WorkflowService } from "../workflow/port";
import { insertIntent } from "../db/intentRepo";
import { generateId } from "../lib/id";
import { startIntentRun } from "../workflow/start-intent";
import { findRunByIdOrWorkflowId, findRunSteps } from "../db/runRepo";
import { findArtifactsByRunId, findArtifactByUri } from "../db/artifactRepo";
import { projectRunHeader, projectStepRows } from "./run-view";
import { assertIntent } from "../contracts/intent.schema";
import { assertRunRequest } from "../contracts/run-request.schema";
import { mapRunStatus } from "../contracts/ui/status-map";
import type { RunHeader } from "../contracts/ui/run-header.schema";
import type { StepRow } from "../contracts/ui/step-row.schema";

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
  return { runId, workflowId, header: projectRunHeader(run) };
}

export async function getRunHeaderService(
  pool: Pool,
  workflow: WorkflowService,
  workflowId: string
): Promise<RunHeader | null> {
  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) return null;

  const header = projectRunHeader(run);

  // C2.T3: Retrieve DBOS status and merge if not terminal in our DB
  // For now, we trust our DB status as primary, but we could overlay DBOS status
  // if we wanted more real-time 'ENQUEUED' vs 'PENDING' distinction.
  // The spec says: "retrieve workflow handle by wid and map DBOS status enum"
  try {
    const dbosStatus = await workflow.getWorkflowStatus(run.workflow_id);
    if (dbosStatus) {
      // Map DBOS status to UI status if it provides better fidelity
      if (dbosStatus === "PENDING") header.status = "ENQUEUED";
      if (dbosStatus === "RUNNING") header.status = "PENDING";
      if (dbosStatus === "COMPLETED" && header.status !== "SUCCESS") {
         // This might happen if our worker crashed before updating app.runs
         // But we should probably rely on our own state for SUCCESS to ensure artifacts are flushed
      }
    }
  } catch (e) {
    // Ignore DBOS status fetch errors, fallback to DB status
    console.error(`Failed to fetch DBOS status for ${run.workflow_id}:`, e);
  }

  return header;
}

export async function getStepRowsService(
  pool: Pool,
  workflowId: string
): Promise<StepRow[]> {
  const run = await findRunByIdOrWorkflowId(pool, workflowId);
  if (!run) return [];

  const steps = await findRunSteps(pool, run.id);
  const artifacts = await findArtifactsByRunId(pool, run.id);

  return projectStepRows(steps, artifacts, run.workflow_id);
}

export async function getArtifactService(pool: Pool, uri: string) {
  // uri might be a URI or a SHA or an ID. findArtifactByUri handles URIs.
  // We might need to support other lookups if the UI requests them.
  return findArtifactByUri(pool, uri);
}
