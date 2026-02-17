import { createPool } from "./db/pool";
import { startApp } from "./server/app";

async function main(): Promise<void> {
  const pool = createPool();
  const app = await startApp(pool);

  const shutdown = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
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
