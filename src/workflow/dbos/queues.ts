import { WorkflowQueue } from "@dbos-inc/dbos-sdk";
import { getConfig } from "../../config";

let initialized = false;

export function initQueues() {
  if (initialized) return;
  const config = getConfig();

  // Queue classes are declared once and shared across worker/app runtimes.
  // We use the config from the file which picks up env vars.
  new WorkflowQueue("compileQ", { priorityEnabled: true });
  new WorkflowQueue("sbxQ", {
    priorityEnabled: true,
    partitionQueue: config.sbxQueue.partition,
    concurrency: config.sbxQueue.concurrency,
    workerConcurrency: config.sbxQueue.workerConcurrency,
    rateLimit: {
      limitPerPeriod: config.sbxQueue.rateLimit.limitPerPeriod,
      periodSec: config.sbxQueue.rateLimit.periodSec
    }
  });
  new WorkflowQueue("controlQ", { priorityEnabled: true });
  new WorkflowQueue("intentQ");
  initialized = true;
}
