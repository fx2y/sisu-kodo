import { WorkflowQueue } from "@dbos-inc/dbos-sdk";
import { getConfig } from "../../config";

const config = getConfig();

// Queue classes are declared once at module load and shared across worker/app runtimes.
new WorkflowQueue("compileQ", { concurrency: 10, priorityEnabled: true });
new WorkflowQueue("sbxQ", {
  concurrency: config.sbxQueue.concurrency,
  workerConcurrency: config.sbxQueue.workerConcurrency,
  rateLimit: {
    limitPerPeriod: config.sbxQueue.rateLimit.limitPerPeriod,
    periodSec: config.sbxQueue.rateLimit.periodSec
  },
  priorityEnabled: true,
  partitionQueue: config.sbxQueue.partition
});
new WorkflowQueue("controlQ", { concurrency: 5, priorityEnabled: true });
new WorkflowQueue("intentQ", { concurrency: 10 });
