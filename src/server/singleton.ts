import { createPool } from "../db/pool";
import { getConfig } from "../config";
import { DBOSClientWorkflowEngine } from "../api-shim/dbos-client";
import type { Pool } from "pg";
import type { WorkflowService } from "../workflow/port";

let pool: Pool | null = null;
let sysPool: Pool | null = null;
let workflowEngine: WorkflowService | null = null;
let initialized = false;

/**
 * For tests: manually register services to avoid double-initialization of DBOS.
 */
export function registerServices(p: Pool, w: WorkflowService, s?: Pool): void {
  pool = p;
  sysPool = s ?? p;
  workflowEngine = w;
  initialized = true;
}

export async function getServices(): Promise<{ pool: Pool; sysPool: Pool; workflow: WorkflowService }> {
  if (!initialized) {
    const cfg = getConfig();

    if (!pool) {
      pool = createPool();
    }
    if (!sysPool) {
      sysPool = createPool(cfg.sysDbName);
    }
    if (!workflowEngine) {
      if (cfg.workflowRuntimeMode !== "api-shim") {
        throw new Error("API runtime supports only WORKFLOW_RUNTIME_MODE=api-shim");
      }
      workflowEngine = await DBOSClientWorkflowEngine.create(
        cfg.systemDatabaseUrl,
        pool,
        cfg.appVersion
      );
    }
    initialized = true;
  }
  return { pool: pool!, sysPool: sysPool!, workflow: workflowEngine! };
}
