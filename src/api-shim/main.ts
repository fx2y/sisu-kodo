import { createPool } from "../db/pool";
import { startApp } from "../server/app";
import { getConfig } from "../config";
import { DBOSClientWorkflowEngine } from "./dbos-client";

async function main(): Promise<void> {
  const cfg = getConfig();

  // 1. Initialize API shim engine
  const pool = createPool();
  const workflowEngine = await DBOSClientWorkflowEngine.create(
    cfg.systemDatabaseUrl,
    pool,
    cfg.appVersion
  );

  // 2. Start app (reusing server/app.ts)
  const app = await startApp(pool, workflowEngine);

  console.log(`[API-Shim] HTTP server listening on ${cfg.port}`);

  const shutdown = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await workflowEngine.destroy();
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
  console.error(`[API-Shim] Fatal: ${message}`);
  process.exit(1);
});
