import type { WorkflowOptions } from "./port";
import { isPartitionedQueue } from "./dbos/queues";

export type IntentQueueName = "compileQ" | "sbxQ" | "controlQ" | "intentQ";

export type ResolvedIntentEnqueuePolicy = {
  queueName: IntentQueueName;
  priority?: number;
  deduplicationID?: string;
  timeoutMS?: number;
  queuePartitionKey?: string;
};

type IntentWorkflowEnqueueOptions = {
  deduplicationID?: string;
  priority?: number;
  queuePartitionKey?: string;
};

function resolveQueuePartitionKey(
  queueName: string | undefined,
  queuePartitionKey: string | undefined
): string | undefined {
  if (!queueName || !isPartitionedQueue(queueName)) {
    return undefined;
  }
  return queuePartitionKey;
}

function resolveDeduplicationID(
  queueName: string | undefined,
  deduplicationID: string | undefined
): string | undefined {
  if (!queueName || !isPartitionedQueue(queueName)) {
    return deduplicationID;
  }
  // DBOS does not support deduplication on partitioned queues.
  return undefined;
}

function toEnqueueOptions(options: WorkflowOptions | undefined): IntentWorkflowEnqueueOptions {
  const queueName = options?.queueName;
  return {
    deduplicationID: resolveDeduplicationID(queueName, options?.deduplicationID),
    priority: options?.priority,
    queuePartitionKey: resolveQueuePartitionKey(queueName, options?.queuePartitionKey)
  };
}

export function toIntentRunWorkflowOptions(policy: ResolvedIntentEnqueuePolicy): WorkflowOptions {
  const deduplicationID = resolveDeduplicationID(policy.queueName, policy.deduplicationID);
  return {
    queueName: policy.queueName,
    priority: policy.priority,
    deduplicationID,
    timeoutMS: policy.timeoutMS,
    queuePartitionKey: resolveQueuePartitionKey(policy.queueName, policy.queuePartitionKey)
  };
}

export function buildDBOSIntentRunConfig(workflowId: string, options?: WorkflowOptions) {
  return {
    workflowID: workflowId,
    queueName: options?.queueName ?? "intentQ",
    timeoutMS: options?.timeoutMS,
    enqueueOptions: toEnqueueOptions(options)
  };
}

export function buildDBOSClientIntentRunConfig(
  workflowId: string,
  options?: WorkflowOptions,
  appVersion?: string
) {
  const queueName = options?.queueName ?? "intentQ";
  const enqueueOptions = toEnqueueOptions(options);
  return {
    queueName,
    workflowClassName: "IntentWorkflow",
    workflowName: "run",
    workflowID: workflowId,
    workflowTimeoutMS: options?.timeoutMS,
    deduplicationID: enqueueOptions.deduplicationID,
    priority: enqueueOptions.priority,
    queuePartitionKey: enqueueOptions.queuePartitionKey,
    appVersion
  };
}
