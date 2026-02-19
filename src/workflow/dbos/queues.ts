import { WorkflowQueue } from "@dbos-inc/dbos-sdk";
import { getConfig } from "../../config";

const config = getConfig();

// Queue classes are declared once at module load and shared across worker/app runtimes.
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
