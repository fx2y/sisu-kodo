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
    await updateRunStatus(pool, finalRunId, "failed");
    throw err;
  }

  return { runId: finalRunId, workflowId };
}
