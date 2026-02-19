import type { Pool } from "pg";
import type { RunStatus, RunStep } from "../contracts/run-view.schema";

export type { RunStep };

export type RunRow = {
  id: string;
  intent_id: string;
  workflow_id: string;
  status: RunStatus;
  trace_id?: string;
  tenant_id?: string;
  queue_partition_key?: string;
  last_step?: string;
  error?: string | null;
  retry_count: number;
  next_action?: string | null;
  created_at: Date;
  updated_at: Date;
};

export async function insertRun(
  pool: Pool,
  run: Pick<
    RunRow,
    "id" | "intent_id" | "workflow_id" | "status" | "trace_id" | "tenant_id" | "queue_partition_key"
  >
): Promise<RunRow> {
  const { id, intent_id, workflow_id, status, trace_id, tenant_id, queue_partition_key } = run;

  const res = await pool.query(
    `INSERT INTO app.runs (id, intent_id, workflow_id, status, trace_id, tenant_id, queue_partition_key) 
     VALUES ($1, $2, $3, $4, $5, $6, $7) 
     ON CONFLICT (workflow_id) DO UPDATE SET workflow_id = EXCLUDED.workflow_id
     RETURNING id, intent_id, workflow_id, status, trace_id, tenant_id, queue_partition_key, last_step, error, retry_count, next_action, created_at, updated_at`,
    [id, intent_id, workflow_id, status, trace_id, tenant_id, queue_partition_key]
  );

  return res.rows[0];
}

export async function updateRunStatus(pool: Pool, id: string, status: RunStatus): Promise<void> {
  await pool.query(`UPDATE app.runs SET status = $1, updated_at = NOW() WHERE id = $2`, [
    status,
    id
  ]);
}

export async function updateRunOps(
  pool: Pool,
  id: string,
  ops: Partial<Pick<RunRow, "status" | "last_step" | "error" | "retry_count" | "next_action">>
): Promise<void> {
  const fields: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [id];

  if (ops.status) {
    fields.push(`status = $${fields.length + 1}`);
    values.push(ops.status);
  }
  if (ops.last_step !== undefined) {
    fields.push(`last_step = $${fields.length + 1}`);
    values.push(ops.last_step);
  }
  if (ops.error !== undefined) {
    fields.push(`error = $${fields.length + 1}`);
    values.push(ops.error);
  }
  if (ops.retry_count !== undefined) {
    fields.push(`retry_count = $${fields.length + 1}`);
    values.push(ops.retry_count);
  }
  if (ops.next_action !== undefined) {
    fields.push(`next_action = $${fields.length + 1}`);
    values.push(ops.next_action);
  }

  await pool.query(`UPDATE app.runs SET ${fields.join(", ")} WHERE id = $1`, values);
}

export async function findRunById(pool: Pool, id: string): Promise<RunRow | undefined> {
  const res = await pool.query(
    `SELECT id, intent_id, workflow_id, status, trace_id, tenant_id, queue_partition_key, last_step, error, retry_count, next_action, created_at, updated_at 
     FROM app.runs WHERE id = $1`,
    [id]
  );

  if (res.rowCount === 0) return undefined;
  return res.rows[0];
}

export async function findRunByWorkflowId(
  pool: Pool,
  workflowId: string
): Promise<RunRow | undefined> {
  const res = await pool.query(
    `SELECT id, intent_id, workflow_id, status, trace_id, tenant_id, queue_partition_key, last_step, error, retry_count, next_action, created_at, updated_at 
     FROM app.runs WHERE workflow_id = $1`,
    [workflowId]
  );

  if (res.rowCount === 0) return undefined;
  return res.rows[0];
}

export async function findRunByIdOrWorkflowId(
  pool: Pool,
  idOrWorkflowId: string
): Promise<RunRow | undefined> {
  const res = await pool.query(
    `SELECT id, intent_id, workflow_id, status, trace_id, tenant_id, queue_partition_key, last_step, error, retry_count, next_action, created_at, updated_at 
     FROM app.runs WHERE id = $1 OR workflow_id = $1`,
    [idOrWorkflowId]
  );

  if (res.rowCount === 0) return undefined;
  return res.rows[0];
}

export async function insertRunStep(pool: Pool, run_id: string, step: RunStep): Promise<void> {
  const { stepId, phase, output, startedAt, finishedAt } = step;

  await pool.query(
    `INSERT INTO app.run_steps (run_id, step_id, phase, output, started_at, finished_at) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     ON CONFLICT (run_id, step_id) DO UPDATE 
     SET phase = EXCLUDED.phase, output = EXCLUDED.output, 
         started_at = EXCLUDED.started_at, finished_at = EXCLUDED.finished_at`,
    [run_id, stepId, phase, output ? JSON.stringify(output) : null, startedAt, finishedAt]
  );
}

export type RunStepRow = {
  stepId: string;

  phase: string;

  output?: unknown;

  startedAt?: Date;

  finishedAt?: Date;
};

export async function findRunSteps(pool: Pool, run_id: string): Promise<RunStepRow[]> {
  const res = await pool.query<RunStepRow>(
    `SELECT step_id as "stepId", phase, output, started_at as "startedAt", finished_at as "finishedAt" 
     FROM app.run_steps WHERE run_id = $1
     ORDER BY started_at ASC NULLS LAST, step_id ASC`,
    [run_id]
  );

  return res.rows;
}
