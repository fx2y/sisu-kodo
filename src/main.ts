import { DBOS } from "@dbos-inc/dbos-sdk";
import { createPool } from "./db/pool";
import { startApp } from "./server/app";
import { getConfig } from "./config";
import { DBOSWorkflowEngine } from "./workflow/engine-dbos";
import { randomSeed } from "./lib/rng";

async function main(): Promise<void> {
  randomSeed();
  const cfg = getConfig();

  // 1. Initialize and launch DBOS
  // Workflows/Steps are usually discovered or can be explicitly handled.
  // With DBOS 4.x, just launching it will pick up config.
  await DBOS.launch();

  // 2. Initialize engine
  const workflowEngine = new DBOSWorkflowEngine(cfg.workflowSleepMs);

  // 3. Start app
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
