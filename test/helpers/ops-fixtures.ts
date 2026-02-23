import type { Pool } from "pg";
import type { WorkflowService } from "../../src/workflow/port";
import { generateId } from "../../src/lib/id";

/**
 * Deterministic test fixtures for Ops Cycle C0-C7.
 */

export const OPS_TEST_TIMEOUT = 15000;
export const OPS_POLL_INTERVAL = 500;
const OPS_RUN_NONCE = `${process.pid}-${Date.now()}`;
let opsSeq = 0;

export function generateOpsTestId(prefix: string = "ops"): string {
  opsSeq += 1;
  return generateId(`${prefix}-${OPS_RUN_NONCE}-${opsSeq}`);
}

export async function waitForWorkflowStatus(
  service: WorkflowService,
  workflowId: string,
  targetStatus: string,
  timeoutMs: number = OPS_TEST_TIMEOUT
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await service.getWorkflowStatus(workflowId);
    if (status === targetStatus) {
      return status;
    }
    // Terminal statuses that are not the target
    if (
      status &&
      ["SUCCESS", "FAILED", "CANCELLED", "COMPLETED", "ERROR"].includes(status) &&
      status !== targetStatus
    ) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, OPS_POLL_INTERVAL));
  }
  throw new Error(`Timeout waiting for workflow ${workflowId} to reach status ${targetStatus}`);
}

export async function assertSqlCount(
  pool: Pool,
  table: string,
  where: string,
  params: unknown[],
  expected: number
): Promise<void> {
  const query = `SELECT COUNT(*)::INT as count FROM ${table} WHERE ${where}`;
  const result = await pool.query<{ count: number }>(query, params);
  const actual = result.rows[0].count;
  if (actual !== expected) {
    throw new Error(`SQL assertion failed for ${table}: expected ${expected}, got ${actual}`);
  }
}

export async function getWorkflowRow(pool: Pool, workflowId: string) {
  const result = await pool.query(
    "SELECT * FROM app.runs WHERE id = (SELECT id FROM app.runs WHERE workflow_id = $1 OR id = $1 LIMIT 1)",
    [workflowId]
  );
  return result.rows[0];
}
