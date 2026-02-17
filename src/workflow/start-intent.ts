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
  // C1.T11/T12: workflowID strictly equals intentId
  const workflowId = intentId;

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
    // If it's a "duplicated" error, we might want to handle it differently,
    // but for now fail-closed is the rule.
    // Actually, if it's already running, it's NOT a failure of the trigger, it's just already triggered.
    // But DBOS.startWorkflow with same ID returns handle if already exists.
    await updateRunStatus(pool, runId, "failed");
    throw err;
  }

  return { runId, workflowId };
}
