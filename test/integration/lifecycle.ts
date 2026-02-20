import { DBOS } from "@dbos-inc/dbos-sdk";
import { initQueues } from "../../src/workflow/dbos/queues";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { getConfig } from "../../src/config";
import { configureDBOSRuntime } from "../../src/lib/otlp";
import { Pool } from "pg";

export interface TestLifecycle {
  pool: Pool;
  sysPool: Pool;
  workflow: DBOSWorkflowEngine;
}

export async function setupLifecycle(sleepMs: number = 20): Promise<TestLifecycle> {
  const cfg = getConfig();
  configureDBOSRuntime(cfg);
  initQueues();
  await DBOS.launch();
  // DBOS.logRegisteredEndpoints(); // Useful for debugging if needed
  return {
    pool: createPool(),
    sysPool: new Pool({ connectionString: cfg.systemDatabaseUrl }),
    workflow: new DBOSWorkflowEngine(sleepMs)
  };
}

export async function teardownLifecycle(lifecycle: TestLifecycle): Promise<void> {
  // Use a timeout for shutdown to prevent G19 hangs
  const shutdownPromise = DBOS.shutdown();
  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => {
      reject(new Error("DBOS.shutdown timed out in teardownLifecycle"));
    }, 5000);
  });

  try {
    await Promise.race([shutdownPromise, timeoutPromise]);
  } catch (e) {
    console.error("teardownLifecycle error:", e);
  }

  if (lifecycle.pool) {
    await lifecycle.pool.end();
  }
  if (lifecycle.sysPool) {
    await lifecycle.sysPool.end();
  }
  await closePool();
}
