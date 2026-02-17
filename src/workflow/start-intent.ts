import type { Pool } from "pg";
import type { WorkflowService } from "./port";
import { insertRun, updateRunStatus } from "../db/runRepo";
import { generateId } from "../lib/id";
import type { RunRequest } from "../contracts/run-request.schema";

export async function startIntentRun(
  pool: Pool,
  workflow: WorkflowService,
  intentId: string,
  reqPayload: RunRequest
) {
  const runId = generateId("run");
  const workflowId = generateId("itwf");

  await insertRun(pool, {
    id: runId,
    intent_id: intentId,
    workflow_id: workflowId,
    status: "queued",
    trace_id: reqPayload.traceId
  });

  try {
    await workflow.startIntentRun(workflowId);
  } catch (err) {
    await updateRunStatus(pool, runId, "failed");
    throw err;
  }

  return { runId, workflowId };
}
