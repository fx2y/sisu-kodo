import { DBOS } from "@dbos-inc/dbos-sdk";
import { createPool } from "./db/pool";
import { startApp } from "./server/app";
import { getConfig } from "./config";
import { DBOSWorkflowEngine } from "./workflow/engine-dbos";
import { randomSeed } from "./lib/rng";
import { configureDBOSRuntime } from "./lib/otlp";
import { OCWrapper } from "./oc/wrapper";
import { waitForOCDaemon } from "./oc/daemon";

async function main(): Promise<void> {
  const cfg = getConfig();
  randomSeed(cfg.rngSeed);

  configureDBOSRuntime(cfg);

  await DBOS.launch();

  const ocWrapper = new OCWrapper(cfg);
  await waitForOCDaemon(ocWrapper);

  const workflowEngine = new DBOSWorkflowEngine(cfg.workflowSleepMs);

  const pool = createPool();
  const app = await startApp(pool, workflowEngine);

  const shutdown = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await workflowEngine.destroy();
    await DBOS.shutdown();
    await pool.end();
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
  console.error(message);
  process.exit(1);
});
