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
  // C1.T11/T12: workflowID strictly equals intentId unless deduplicationID is provided
  const workflowId = reqPayload.deduplicationID ?? intentId;

  const runRow = await insertRun(pool, {
    id: runId,
    intent_id: intentId,
    workflow_id: workflowId,
    status: "queued",
    trace_id: reqPayload.traceId
  });

  const finalRunId = runRow.id;

  try {
    await workflow.startIntentRun(workflowId, {
      queueName: reqPayload.queueName,
      priority: reqPayload.priority,
      deduplicationID: reqPayload.deduplicationID,
      timeoutMS: reqPayload.timeoutMS
    });
  } catch (err) {
    await updateRunStatus(pool, finalRunId, "failed");
    throw err;
  }

  return { runId: finalRunId, workflowId };
}
