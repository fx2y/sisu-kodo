import { createHash } from "node:crypto";
import type { Pool } from "pg";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const pairs = Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function nextStepAttempt(pool: Pool, runId: string, stepId: string): Promise<number> {
  const res = await pool.query<{ attempt: number | null }>(
    `SELECT (output ->> 'attempt')::INT AS attempt
     FROM app.run_steps
     WHERE run_id = $1 AND step_id = $2`,
    [runId, stepId]
  );

  const attempt = res.rows[0]?.attempt ?? 0;
  return attempt + 1;
}

export function withStepAttempt(
  output: Record<string, unknown>,
  attempt: number
): Record<string, unknown> {
  return { ...output, attempt };
}

export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

export function buildReceiptKey(runId: string, stepId: string, payload: unknown): string {
  return createHash("sha256")
    .update(`${runId}:${stepId}:${payloadHash(payload)}`)
    .digest("hex");
}

export function asObject(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  return { value };
}
