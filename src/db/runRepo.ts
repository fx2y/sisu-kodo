import type { Pool } from "pg";
import type { RunStatus, RunStep } from "../contracts/run-view.schema";

export type { RunStep };

export type RunRow = {
  id: string;
  intent_id: string;
  workflow_id: string;
  status: RunStatus;
  trace_id?: string;
  created_at: Date;
  updated_at: Date;
};

export async function insertRun(
  pool: Pool,
  run: Pick<RunRow, "id" | "intent_id" | "workflow_id" | "status" | "trace_id">
): Promise<RunRow> {
  const { id, intent_id, workflow_id, status, trace_id } = run;

  const res = await pool.query(
    `INSERT INTO app.runs (id, intent_id, workflow_id, status, trace_id) 
     VALUES ($1, $2, $3, $4, $5) 
     ON CONFLICT (workflow_id) DO UPDATE SET workflow_id = EXCLUDED.workflow_id
     RETURNING id, intent_id, workflow_id, status, trace_id, created_at, updated_at`,
    [id, intent_id, workflow_id, status, trace_id]
  );

  return res.rows[0];
}

export async function updateRunStatus(pool: Pool, id: string, status: RunStatus): Promise<void> {
  await pool.query(`UPDATE app.runs SET status = $1, updated_at = NOW() WHERE id = $2`, [
    status,
    id
  ]);
}

export async function findRunById(pool: Pool, id: string): Promise<RunRow | undefined> {
  const res = await pool.query(
    `SELECT id, intent_id, workflow_id, status, trace_id, created_at, updated_at FROM app.runs WHERE id = $1`,
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
    `SELECT id, intent_id, workflow_id, status, trace_id, created_at, updated_at FROM app.runs WHERE workflow_id = $1`,
    [workflowId]
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
