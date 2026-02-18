import type { Pool } from "pg";

export type MockReceiptRow = {
  receipt_key: string;
  run_id: string;
  step_id: string;
  payload_hash: string;
  first_attempt: number;
  last_attempt: number;
  seen_count: number;
  request_payload: Record<string, unknown>;
  response_payload?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export async function upsertMockReceipt(
  pool: Pool,
  row: Pick<
    MockReceiptRow,
    | "receipt_key"
    | "run_id"
    | "step_id"
    | "payload_hash"
    | "first_attempt"
    | "last_attempt"
    | "request_payload"
    | "response_payload"
  >
): Promise<number> {
  const res = await pool.query<{ seen_count: number }>(
    `INSERT INTO app.mock_receipts (
       receipt_key, run_id, step_id, payload_hash, first_attempt, last_attempt, request_payload, response_payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (receipt_key) DO UPDATE
     SET seen_count = app.mock_receipts.seen_count + 1,
         last_attempt = GREATEST(app.mock_receipts.last_attempt, EXCLUDED.last_attempt),
         response_payload = EXCLUDED.response_payload,
         updated_at = NOW()
     RETURNING seen_count`,
    [
      row.receipt_key,
      row.run_id,
      row.step_id,
      row.payload_hash,
      row.first_attempt,
      row.last_attempt,
      row.request_payload,
      row.response_payload ?? null
    ]
  );

  return res.rows[0]?.seen_count ?? 1;
}

export async function findDuplicateReceiptCount(pool: Pool): Promise<number> {
  const res = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM app.mock_receipts WHERE seen_count > 1`
  );
  return Number(res.rows[0]?.c ?? "0");
}
