import type { Pool } from "pg";
import type { RunStatus, RunStep } from "../contracts/run-view.schema";

export type { RunStep };

export type RunRow = {
  id: string;
  intent_id: string;
  workflow_id: string;
  status: RunStatus;
  trace_id?: string | null;
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
     ON CONFLICT (workflow_id) DO NOTHING
     RETURNING id, intent_id, workflow_id, status, trace_id, tenant_id, queue_partition_key, last_step, error, retry_count, next_action, created_at, updated_at`,
    [id, intent_id, workflow_id, status, trace_id, tenant_id, queue_partition_key]
  );

  if (res.rowCount === 0) {
    const existing = await findRunByWorkflowId(pool, workflow_id);
    if (!existing) {
      throw new Error(`Conflict on workflow_id ${workflow_id} but record not found`);
    }
    // Assertion: if it exists, it should match critical fields or at least be consistent
    if (existing.intent_id !== intent_id) {
      throw new Error(
        `Divergence in run ${workflow_id}: intent_id mismatch ${existing.intent_id} !== ${intent_id}`
      );
    }
    return existing;
  }

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

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export async function insertRunStep(
  pool: Pool,
  run_id: string,
  step: RunStep & { traceId?: string | null; spanId?: string | null }
): Promise<void> {
  const { stepId, phase, output, startedAt, finishedAt, traceId, spanId } = step;
  const attempt = isRecord(output) && typeof output.attempt === "number" ? output.attempt : 1;

  const res = await pool.query(
    `INSERT INTO app.run_steps (run_id, step_id, attempt, phase, output, started_at, finished_at, trace_id, span_id) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
     ON CONFLICT (run_id, step_id, attempt) DO NOTHING
     RETURNING step_id`,
    [
      run_id,
      stepId,
      attempt,
      phase,
      output ? JSON.stringify(output) : null,
      startedAt,
      finishedAt,
      traceId,
      spanId
    ]
  );

  if (res.rowCount === 0) {
    const existingRes = await pool.query(
      `SELECT phase, output FROM app.run_steps WHERE run_id = $1 AND step_id = $2 AND attempt = $3`,
      [run_id, stepId, attempt]
    );
    const existing = existingRes.rows[0];
    if (existing) {
      // Basic check: if phase or output differs, we have a determinism problem
      const newOutputStr = output ? JSON.stringify(output) : null;
      const existingOutputStr = existing.output ? JSON.stringify(existing.output) : null;
      if (existing.phase !== phase || existingOutputStr !== newOutputStr) {
        throw new Error(
          `Determinism violation in ${run_id}:${stepId}:${attempt}. Phase or output mismatch.`
        );
      }
    }
  }
}

export type RunStepRow = {
  stepId: string;
  phase: string;
  output?: unknown;
  startedAt?: Date;
  finishedAt?: Date;
  attempt: number;
  traceId?: string | null;
  spanId?: string | null;
};

export async function findRunSteps(pool: Pool, run_id: string): Promise<RunStepRow[]> {
  const res = await pool.query<RunStepRow>(
    `SELECT DISTINCT ON (step_id) step_id as "stepId", phase, output, started_at as "startedAt", finished_at as "finishedAt", attempt, trace_id as "traceId", span_id as "spanId" 
     FROM app.run_steps WHERE run_id = $1
     ORDER BY step_id, attempt DESC`,
    [run_id]
  );

  // Re-sort by started_at for chronologic view
  return res.rows.sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
}
