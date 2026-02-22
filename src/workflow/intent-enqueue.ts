import type { WorkflowOptions } from "./port";

export type IntentQueueName = "compileQ" | "sbxQ" | "controlQ" | "intentQ";

export type ResolvedIntentEnqueuePolicy = {
  queueName: IntentQueueName;
  priority: number;
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
  if (queueName !== "sbxQ") {
    return undefined;
  }
  return queuePartitionKey;
}

function toEnqueueOptions(options: WorkflowOptions | undefined): IntentWorkflowEnqueueOptions {
  return {
    deduplicationID: options?.deduplicationID,
    priority: options?.priority,
    queuePartitionKey: resolveQueuePartitionKey(options?.queueName, options?.queuePartitionKey)
  };
}

export function toIntentRunWorkflowOptions(policy: ResolvedIntentEnqueuePolicy): WorkflowOptions {
  return {
    queueName: policy.queueName,
    priority: policy.priority,
    deduplicationID: policy.deduplicationID,
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
