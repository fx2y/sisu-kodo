import { DBOS } from "@dbos-inc/dbos-sdk";
import { initQueues } from "../workflow/dbos/queues";
import "../workflow/dbos/intentWorkflow";
import "../workflow/dbos/crashDemoWorkflow";
import "../workflow/dbos/timeWorkflow";
import { registerScheduledWorkflows } from "../workflow/dbos/scheduledOpsWorkflow";
import { randomSeed } from "../lib/rng";
import { configureDBOSRuntime } from "../lib/otlp";
import { getConfig } from "../config";
import { OCWrapper } from "../oc/wrapper";
import { waitForOCDaemon } from "../oc/daemon";

async function main(): Promise<void> {
  const cfg = getConfig();
  randomSeed(cfg.rngSeed);

  configureDBOSRuntime(cfg);
  initQueues();
  registerScheduledWorkflows();

  await DBOS.launch();
  DBOS.logRegisteredEndpoints();

  const ocWrapper = new OCWrapper(cfg);
  await waitForOCDaemon(ocWrapper);

  console.log("[Worker] DBOS worker launched and waiting for workflows...");

  const shutdown = async () => {
    await DBOS.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[Worker] Fatal: ${message}`);
  process.exit(1);
});
