import type { Pool } from "pg";
import type { WorkflowService } from "./port";
import { insertRun, updateRunStatus } from "../db/runRepo";
import { generateId } from "../lib/id";
import type { RunRequest } from "../contracts/run-request.schema";
import { resolveQueuePolicy } from "./queue-policy";
import { initQueues } from "./dbos/queues";
import { findIntentById } from "../db/intentRepo";
import { toIntentRunWorkflowOptions } from "./intent-enqueue";

export async function startIntentRun(
  pool: Pool,
  workflow: WorkflowService,
  intentId: string,
  reqPayload: RunRequest
) {
  initQueues();
  const policy = await resolveQueuePolicy(pool, reqPayload, true);
  const runId = generateId("run");
  const workflowId = intentId;
  const intent = await findIntentById(pool, intentId);
  if (!intent) {
    throw new Error(`Intent not found: ${intentId}`);
  }

  const runRow = await insertRun(pool, {
    id: runId,
    intent_id: intentId,
    intent_hash: intent.intent_hash,
    recipe_id: intent.recipe_id,
    recipe_v: intent.recipe_v,
    recipe_hash: intent.recipe_hash,
    workflow_id: workflowId,
    status: "queued",
    trace_id: reqPayload.traceId,
    tenant_id: reqPayload.tenantId,
    queue_partition_key: policy.queuePartitionKey
  });

  const finalRunId = runRow.id;
  const workflowOptions = toIntentRunWorkflowOptions({
    queueName: policy.queueName,
    priority: policy.priority,
    deduplicationID: policy.deduplicationID,
    timeoutMS: policy.timeoutMS,
    queuePartitionKey: policy.queuePartitionKey
  });

  try {
    await workflow.startIntentRun(workflowId, workflowOptions);
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
