import type { Pool } from "pg";

export type OpencodeCallRow = {
  id: string;
  run_id: string;
  step_id: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  diff?: Record<string, unknown> | null;
  session_id?: string | null;
  agent?: string | null;
  schema_hash?: string | null;
  prompt?: string | null;
  structured?: Record<string, unknown> | null;
  raw_response?: string | null;
  tool_calls?: Record<string, unknown> | null;
  duration_ms?: number | null;
  error?: Record<string, unknown> | null;
  created_at: Date;
};

export async function insertOpencodeCall(
  pool: Pool,
  row: Pick<
    OpencodeCallRow,
    | "id"
    | "run_id"
    | "step_id"
    | "request"
    | "response"
    | "diff"
    | "session_id"
    | "agent"
    | "schema_hash"
    | "prompt"
    | "structured"
    | "raw_response"
    | "tool_calls"
    | "duration_ms"
    | "error"
  >
): Promise<void> {
  await pool.query(
    `INSERT INTO app.opencode_calls (
      id, run_id, step_id, request, response, diff,
      session_id, agent, schema_hash, prompt, structured,
      raw_response, tool_calls, duration_ms, error
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (id) DO NOTHING`,
    [
      row.id,
      row.run_id,
      row.step_id,
      row.request,
      row.response,
      row.diff ?? null,
      row.session_id ?? null,
      row.agent ?? null,
      row.schema_hash ?? null,
      row.prompt ?? null,
      row.structured ?? null,
      row.raw_response ?? null,
      row.tool_calls ?? null,
      row.duration_ms ?? null,
      row.error ?? null
    ]
  );
}

export async function findOpencodeCallsByRunId(
  pool: Pool,
  runId: string
): Promise<OpencodeCallRow[]> {
  const res = await pool.query<OpencodeCallRow>(
    `SELECT *
     FROM app.opencode_calls
     WHERE run_id = $1
     ORDER BY created_at ASC`,
    [runId]
  );
  return res.rows;
}
