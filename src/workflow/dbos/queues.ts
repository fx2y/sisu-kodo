import { WorkflowQueue } from "@dbos-inc/dbos-sdk";
import { getConfig } from "../../config";

let initialized = false;

type ManagedQueueName = "intentQ" | "sbxQ";

export type ManagedQueueConfig = ReturnType<typeof getConfig>["workflowQueues"][ManagedQueueName];

export function getManagedQueueConfig(
  queueName: ManagedQueueName,
  config = getConfig()
): ManagedQueueConfig {
  return config.workflowQueues[queueName];
}

export function isPartitionedQueue(queueName: string, config = getConfig()): boolean {
  if (queueName !== "intentQ" && queueName !== "sbxQ") {
    return false;
  }
  return getManagedQueueConfig(queueName, config).partition;
}

export function isPriorityEnabledQueue(queueName: string, config = getConfig()): boolean {
  if (queueName !== "intentQ" && queueName !== "sbxQ") {
    return true;
  }
  return getManagedQueueConfig(queueName, config).priorityEnabled;
}

export function initQueues() {
  if (initialized) return;
  const config = getConfig();
  const intentQ = getManagedQueueConfig("intentQ", config);
  const sbxQ = getManagedQueueConfig("sbxQ", config);

  // Queue classes are declared once and shared across worker/app runtimes.
  // We use the config from the file which picks up env vars.
  new WorkflowQueue("compileQ", { priorityEnabled: true });
  new WorkflowQueue("sbxQ", {
    priorityEnabled: sbxQ.priorityEnabled,
    partitionQueue: sbxQ.partition,
    concurrency: sbxQ.concurrency,
    workerConcurrency: sbxQ.workerConcurrency,
    rateLimit: {
      limitPerPeriod: sbxQ.rateLimit.limitPerPeriod,
      periodSec: sbxQ.rateLimit.periodSec
    }
  });
  new WorkflowQueue("controlQ", { priorityEnabled: true });
  new WorkflowQueue("intentQ", {
    priorityEnabled: intentQ.priorityEnabled,
    partitionQueue: intentQ.partition,
    concurrency: intentQ.concurrency,
    workerConcurrency: intentQ.workerConcurrency,
    rateLimit: {
      limitPerPeriod: intentQ.rateLimit.limitPerPeriod,
      periodSec: intentQ.rateLimit.periodSec
    }
  });
  initialized = true;
}
