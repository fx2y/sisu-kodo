import type { Pool } from "pg";
import { canonicalStringify } from "../lib/hash";
import type { EvalCheckResult } from "../contracts/eval.schema";

export type EvalResultRow = {
  run_id: string;
  check_id: string;
  pass: boolean;
  reason: string;
  payload: Record<string, unknown> | null;
  created_at: Date;
};

export async function saveEvalResults(
  pool: Pool,
  runId: string,
  results: EvalCheckResult[]
): Promise<void> {
  const ordered = [...results].sort((a, b) => a.checkId.localeCompare(b.checkId));
  for (const result of ordered) {
    const inserted = await pool.query(
      `INSERT INTO app.eval_results (run_id, check_id, pass, reason, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (run_id, check_id) DO NOTHING`,
      [runId, result.checkId, result.pass, result.reason, JSON.stringify(result.payload ?? null)]
    );
    if ((inserted.rowCount ?? 0) > 0) continue;
    const existing = await pool.query<EvalResultRow>(
      `SELECT run_id, check_id, pass, reason, payload, created_at
       FROM app.eval_results
       WHERE run_id = $1 AND check_id = $2`,
      [runId, result.checkId]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new Error(`eval result conflict but missing row: ${runId}:${result.checkId}`);
    }
    if (
      row.pass !== result.pass ||
      row.reason !== result.reason ||
      canonicalStringify(row.payload ?? null) !== canonicalStringify(result.payload ?? null)
    ) {
      throw new Error(`eval divergence: ${runId}:${result.checkId}`);
    }
  }
}

export async function listEvalResults(pool: Pool, runId: string): Promise<EvalResultRow[]> {
  const out = await pool.query<EvalResultRow>(
    `SELECT run_id, check_id, pass, reason, payload, created_at
     FROM app.eval_results
     WHERE run_id = $1
     ORDER BY check_id ASC`,
    [runId]
  );
  return out.rows;
}
