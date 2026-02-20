import { DBOS } from "@dbos-inc/dbos-sdk";
import { initQueues } from "../workflow/dbos/queues";
import { createPool } from "../db/pool";
import { getConfig } from "../config";
import { DBOSWorkflowEngine } from "../workflow/engine-dbos";
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
    
    // DBOS.launch is idempotent if already launched, but usually, it's called once.
    // In Next.js dev mode, this might be called multiple times.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((DBOS as any).executor === undefined) {
      configureDBOSRuntime(cfg);
      initQueues();
      await DBOS.launch();
    }
    if (!pool) {
      pool = createPool();
    }
    if (!workflowEngine) {
      workflowEngine = new DBOSWorkflowEngine(cfg.workflowSleepMs);
    }
    initialized = true;
  }
  return { pool: pool!, workflow: workflowEngine! };
}
