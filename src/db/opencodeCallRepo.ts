import type { Pool } from "pg";

export type OpencodeCallRow = {
  id: string;
  run_id: string;
  step_id: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  diff?: Record<string, unknown> | null;
  created_at: Date;
};

export async function insertOpencodeCall(
  pool: Pool,
  row: Pick<OpencodeCallRow, "id" | "run_id" | "step_id" | "request" | "response" | "diff">
): Promise<void> {
  await pool.query(
    `INSERT INTO app.opencode_calls (id, run_id, step_id, request, response, diff)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.run_id, row.step_id, row.request, row.response, row.diff ?? null]
  );
}

export async function findOpencodeCallsByRunId(
  pool: Pool,
  runId: string
): Promise<OpencodeCallRow[]> {
  const res = await pool.query<OpencodeCallRow>(
    `SELECT id, run_id, step_id, request, response, diff, created_at
     FROM app.opencode_calls
     WHERE run_id = $1
     ORDER BY created_at ASC`,
    [runId]
  );
  return res.rows;
}
