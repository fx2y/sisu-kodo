import { DBOS } from "@dbos-inc/dbos-sdk";
import { createPool } from "../db/pool";
import { getConfig } from "../config";
import { DBOSWorkflowEngine } from "../workflow/engine-dbos";
import { configureDBOSRuntime } from "../lib/otlp";
import type { Pool } from "pg";
import type { WorkflowService } from "../workflow/port";

// Ensure global side effects are loaded
import "../workflow/dbos/intentWorkflow";
import "../workflow/dbos/crashDemoWorkflow";

let pool: Pool | null = null;
let workflowEngine: WorkflowService | null = null;
let initialized = false;

export async function getServices(): Promise<{ pool: Pool; workflow: WorkflowService }> {
  if (!initialized) {
    const cfg = getConfig();
    configureDBOSRuntime(cfg);

    // DBOS.launch is idempotent if already launched, but usually, it's called once.
    // In Next.js dev mode, this might be called multiple times.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((DBOS as any).executor === undefined) {
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
