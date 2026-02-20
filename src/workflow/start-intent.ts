import type { Pool } from "pg";
import type { WorkflowService } from "./port";
import { insertRun, updateRunStatus } from "../db/runRepo";
import { generateId } from "../lib/id";
import type { RunRequest } from "../contracts/run-request.schema";
import { resolveQueuePolicy } from "./queue-policy";

export async function startIntentRun(
  pool: Pool,
  workflow: WorkflowService,
  intentId: string,
  reqPayload: RunRequest
) {
  const policy = await resolveQueuePolicy(pool, reqPayload, true);
  const runId = generateId("run");
  const workflowId = intentId;

  const runRow = await insertRun(pool, {
    id: runId,
    intent_id: intentId,
    workflow_id: workflowId,
    status: "queued",
    trace_id: reqPayload.traceId,
    tenant_id: reqPayload.tenantId,
    queue_partition_key: policy.queuePartitionKey
  });

  const finalRunId = runRow.id;

  try {
    await workflow.startIntentRun(workflowId, {
      queueName: policy.queueName,
      priority: policy.priority,
      deduplicationID: policy.deduplicationID,
      timeoutMS: policy.timeoutMS,
      // C7.T3: Only pass partition key to DBOS if the queue is partitioned.
      // intentQ is not partitioned, so we only pass it if queueName is sbxQ.
      queuePartitionKey: policy.queueName === "sbxQ" ? policy.queuePartitionKey : undefined
    });
  } catch (err) {
    // G04: If it's a conflict or already started, don't mark failed if we re-used a run.
    // Also check if error message indicates it already exists.
    const isConflict =
      err instanceof Error &&
      (err.message.includes("already exists") || err.message.includes("Duplicate workflow ID"));

    if (runRow.id === runId && !isConflict) {
      await updateRunStatus(pool, finalRunId, "failed");
    }

    if (isConflict) {
      return { runId: finalRunId, workflowId };
    }

    throw err;
  }

  return { runId: finalRunId, workflowId };
}
