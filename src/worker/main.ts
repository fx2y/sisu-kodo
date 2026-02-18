import { DBOS } from "@dbos-inc/dbos-sdk";
import "../workflow/dbos/intentWorkflow";
import "../workflow/dbos/crashDemoWorkflow";
import { randomSeed } from "../lib/rng";
import { getConfig } from "../config";
import { OCWrapper } from "../oc/wrapper";
import { waitForOCDaemon } from "../oc/daemon";

async function main(): Promise<void> {
  randomSeed();
  const cfg = getConfig();

  // 1. Initialize and launch DBOS (worker role)
  // Registry of workflows/steps happens via decorators during import.
  await DBOS.launch();

  // 2. Gate on OC daemon health
  const ocWrapper = new OCWrapper(cfg);
  await waitForOCDaemon(ocWrapper);

  // 3. We don't need the engine here if we're only a worker,
  // but if we want to run any logic that needs it, we can.
  // Actually, for a pure worker, launch() is sufficient.
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
