import { DBOS } from "@dbos-inc/dbos-sdk";
import { initQueues } from "../workflow/dbos/queues";
import { createPool } from "../db/pool";
import { getConfig } from "../config";
import { DBOSWorkflowEngine } from "../workflow/engine-dbos";
import { DBOSClientWorkflowEngine } from "../api-shim/dbos-client";
import { configureDBOSRuntime } from "../lib/otlp";
import type { Pool } from "pg";
import type { WorkflowService } from "../workflow/port";

// Ensure global side effects are loaded
import "../workflow/dbos/intentWorkflow";
import "../workflow/dbos/crashDemoWorkflow";
import "../workflow/dbos/slowStepWorkflow";

let pool: Pool | null = null;
let workflowEngine: WorkflowService | null = null;
let initialized = false;

/**
 * For tests: manually register services to avoid double-initialization of DBOS.
 */
export function registerServices(p: Pool, w: WorkflowService): void {
  pool = p;
  workflowEngine = w;
  initialized = true;
}

export async function getServices(): Promise<{ pool: Pool; workflow: WorkflowService }> {
  if (!initialized) {
    const cfg = getConfig();

    if (!pool) {
      pool = createPool();
    }
    if (!workflowEngine) {
      if (cfg.workflowRuntimeMode === "inproc-worker") {
        // DBOS.launch is idempotent if already launched, but usually, it's called once.
        // In Next.js dev mode, this might be called multiple times.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((DBOS as any).executor === undefined) {
          configureDBOSRuntime(cfg);
          initQueues();
          await DBOS.launch();
        }
        workflowEngine = new DBOSWorkflowEngine(cfg.workflowSleepMs);
      } else {
        workflowEngine = await DBOSClientWorkflowEngine.create(
          cfg.systemDatabaseUrl,
          pool,
          cfg.appVersion
        );
      }
    }
    initialized = true;
  }
  return { pool: pool!, workflow: workflowEngine! };
}
