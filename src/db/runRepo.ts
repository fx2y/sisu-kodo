import type { Pool } from "pg";
import type { RunStatus, RunStep } from "../contracts/run-view.schema";
import type { RunBudget } from "../contracts/run-request.schema";
import { canonicalStringify } from "../lib/hash";
import { RunIdentityConflictError, type RunIdentityDrift } from "../lib/run-identity-conflict";

export type { RunStep };

export type RunRow = {
  id: string;
  intent_id: string;
  intent_hash?: string | null;
  recipe_id?: string | null;
  recipe_v?: string | null;
  recipe_hash?: string | null;
  workflow_id: string;
  status: RunStatus;
  trace_id?: string | null;
  tenant_id?: string;
  queue_partition_key?: string;
  budget?: RunBudget | null;
  last_step?: string;
  error?: string | null;
  retry_count: number;
  next_action?: string | null;
  created_at: Date;
  updated_at: Date;
};

function runIdentityDriftFields(
  existing: RunRow,
  incoming: Pick<
    RunRow,
    | "id"
    | "intent_id"
    | "intent_hash"
    | "recipe_id"
    | "recipe_v"
    | "recipe_hash"
    | "trace_id"
    | "tenant_id"
    | "queue_partition_key"
    | "budget"
  >
): RunIdentityDrift[] {
  const drift: RunIdentityDrift[] = [];
  if (existing.id !== incoming.id) drift.push({ field: "id", existing: existing.id, incoming: incoming.id });
  if (existing.intent_id !== incoming.intent_id) drift.push({ field: "intent_id", existing: existing.intent_id, incoming: incoming.intent_id });
  if ((existing.intent_hash ?? null) !== (incoming.intent_hash ?? null)) {
    drift.push({ field: "intent_hash", existing: existing.intent_hash, incoming: incoming.intent_hash });
  }
  if ((existing.recipe_id ?? null) !== (incoming.recipe_id ?? null)) {
    drift.push({ field: "recipe_id", existing: existing.recipe_id, incoming: incoming.recipe_id });
  }
  if ((existing.recipe_v ?? null) !== (incoming.recipe_v ?? null)) {
    drift.push({ field: "recipe_v", existing: existing.recipe_v, incoming: incoming.recipe_v });
  }
  if ((existing.recipe_hash ?? null) !== (incoming.recipe_hash ?? null)) {
    drift.push({ field: "recipe_hash", existing: existing.recipe_hash, incoming: incoming.recipe_hash });
  }
  if ((existing.trace_id ?? null) !== (incoming.trace_id ?? null)) {
    drift.push({ field: "trace_id", existing: existing.trace_id, incoming: incoming.trace_id });
  }
  if ((existing.tenant_id ?? null) !== (incoming.tenant_id ?? null)) {
    drift.push({ field: "tenant_id", existing: existing.tenant_id, incoming: incoming.tenant_id });
  }
  if ((existing.queue_partition_key ?? null) !== (incoming.queue_partition_key ?? null)) {
    drift.push({ field: "queue_partition_key", existing: existing.queue_partition_key, incoming: incoming.queue_partition_key });
  }
  if (canonicalStringify(existing.budget ?? null) !== canonicalStringify(incoming.budget ?? null)) {
    drift.push({ field: "budget", existing: existing.budget, incoming: incoming.budget });
  }
  return drift;
}

export async function insertRun(
  pool: Pool,
  run: Pick<
    RunRow,
    | "id"
    | "intent_id"
    | "intent_hash"
    | "recipe_id"
    | "recipe_v"
    | "recipe_hash"
    | "workflow_id"
    | "status"
    | "trace_id"
    | "tenant_id"
    | "queue_partition_key"
    | "budget"
  >
): Promise<{ run: RunRow; inserted: boolean }> {
  const {
    id,
    intent_id,
    intent_hash,
    recipe_id,
    recipe_v,
    recipe_hash,
    workflow_id,
    status,
    trace_id,
    tenant_id,
    queue_partition_key,
    budget
  } = run;

  const res = await pool.query(
    `INSERT INTO app.runs (id, intent_id, intent_hash, recipe_id, recipe_v, recipe_hash, workflow_id, status, trace_id, tenant_id, queue_partition_key, budget)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     ON CONFLICT (workflow_id) DO NOTHING
     RETURNING id, intent_id, intent_hash, recipe_id, recipe_v, recipe_hash, workflow_id, status, trace_id, tenant_id, queue_partition_key, budget, last_step, error, retry_count, next_action, created_at, updated_at`,
    [
      id,
      intent_id,
      intent_hash ?? null,
      recipe_id ?? null,
      recipe_v ?? null,
      recipe_hash ?? null,
      workflow_id,
      status,
      trace_id ?? null,
      tenant_id ?? null,
      queue_partition_key ?? null,
      budget ? JSON.stringify(budget) : null
    ]
  );

  if (res.rowCount === 0) {
    const existing = await findRunByWorkflowId(pool, workflow_id);
    if (!existing) {
      throw new Error(`Conflict on workflow_id ${workflow_id} but record not found`);
    }
    const drift = runIdentityDriftFields(existing, {
      id,
      intent_id,
      intent_hash,
      recipe_id,
      recipe_v,
      recipe_hash,
      trace_id,
      tenant_id,
      queue_partition_key,
      budget
    });
    if (drift.length > 0) {
      throw new RunIdentityConflictError(
        `Divergence in run ${workflow_id}: identity drift on ${drift.map(d => d.field).join(", ")}`,
        drift
      );
    }
    return { run: existing, inserted: false };
  }

  return { run: res.rows[0], inserted: true };
}

export async function updateRunStatus(pool: Pool, id: string, status: RunStatus): Promise<void> {
  await pool.query(
    `UPDATE app.runs
        SET status = CASE
              WHEN status IN ('succeeded', 'failed', 'canceled', 'retries_exceeded')
                   AND $1::text NOT IN ('succeeded', 'failed', 'canceled', 'retries_exceeded')
              THEN status
              ELSE $1::text
            END,
            updated_at = NOW()
      WHERE id = $2::text`,
    [status, id]
  );
}

export async function updateRunOps(
  pool: Pool,
  id: string,
  ops: Partial<Pick<RunRow, "status" | "last_step" | "error" | "retry_count" | "next_action">>
): Promise<void> {
  const fields: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [];

  if (ops.status) {
    const statusIdx = values.length + 1;
    values.push(ops.status);
    const allowTerminalReentryIdx = values.length + 1;
    values.push(ops.status === "repairing" && ops.retry_count !== undefined);
    fields.push(
      `status = CASE
         WHEN status IN ('succeeded', 'failed', 'canceled', 'retries_exceeded')
              AND $${statusIdx}::text NOT IN ('succeeded', 'failed', 'canceled', 'retries_exceeded')
              AND NOT $${allowTerminalReentryIdx}::boolean
         THEN status
         ELSE $${statusIdx}::text
       END`
    );
  }
  if (ops.last_step !== undefined) {
    fields.push(`last_step = $${values.length + 1}::text`);
    values.push(ops.last_step);
  }
  if (ops.error !== undefined) {
    fields.push(`error = $${values.length + 1}::text`);
    values.push(ops.error);
  }
  if (ops.retry_count !== undefined) {
    fields.push(`retry_count = $${values.length + 1}::integer`);
    values.push(ops.retry_count);
  }
  if (ops.next_action !== undefined) {
    fields.push(`next_action = $${values.length + 1}::text`);
    values.push(ops.next_action);
  }

  const idIdx = values.length + 1;
  values.push(id);
  const query = `UPDATE app.runs SET ${fields.join(", ")} WHERE id = $${idIdx}::text`;
  await pool.query(query, values);
}

export async function findRunById(pool: Pool, id: string): Promise<RunRow | undefined> {
  const res = await pool.query(
    `SELECT id, intent_id, intent_hash, recipe_id, recipe_v, recipe_hash, workflow_id, status, trace_id, tenant_id, queue_partition_key, budget, last_step, error, retry_count, next_action, created_at, updated_at
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
    `SELECT id, intent_id, intent_hash, recipe_id, recipe_v, recipe_hash, workflow_id, status, trace_id, tenant_id, queue_partition_key, budget, last_step, error, retry_count, next_action, created_at, updated_at
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
    `SELECT id, intent_id, intent_hash, recipe_id, recipe_v, recipe_hash, workflow_id, status, trace_id, tenant_id, queue_partition_key, budget, last_step, error, retry_count, next_action, created_at, updated_at
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
