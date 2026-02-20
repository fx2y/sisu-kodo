import type { Pool } from "pg";

export interface HumanGate {
  run_id: string;
  gate_key: string;
  topic: string;
  created_at: Date;
}

export interface HumanInteraction {
  id: string;
  workflow_id: string;
  gate_key: string;
  topic: string;
  dedupe_key: string;
  payload_hash: string;
  payload: any;
  created_at: Date;
}

export async function insertHumanGate(
  pool: Pool,
  gate: { runId: string; gateKey: string; topic: string }
): Promise<void> {
  await pool.query(
    "INSERT INTO app.human_gates (run_id, gate_key, topic) VALUES ($1, $2, $3) ON CONFLICT (run_id, gate_key) DO NOTHING",
    [gate.runId, gate.gateKey, gate.topic]
  );
}

export async function findHumanGate(
  pool: Pool,
  runId: string,
  gateKey: string
): Promise<HumanGate | null> {
  const res = await pool.query<HumanGate>(
    "SELECT run_id, gate_key, topic, created_at FROM app.human_gates WHERE run_id = $1 AND gate_key = $2",
    [runId, gateKey]
  );
  return res.rows[0] ?? null;
}

export async function findLatestGateByRunId(pool: Pool, runId: string): Promise<HumanGate | null> {
  const res = await pool.query<HumanGate>(
    "SELECT run_id, gate_key, topic, created_at FROM app.human_gates WHERE run_id = $1 ORDER BY created_at DESC LIMIT 1",
    [runId]
  );
  return res.rows[0] ?? null;
}

export async function insertHumanInteraction(
  pool: Pool,
  interaction: {
    workflowId: string;
    gateKey: string;
    topic: string;
    dedupeKey: string;
    payloadHash: string;
    payload: any;
  }
): Promise<boolean> {
  const res = await pool.query(
    `INSERT INTO app.human_interactions 
     (workflow_id, gate_key, topic, dedupe_key, payload_hash, payload) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     ON CONFLICT (workflow_id, gate_key, dedupe_key) DO NOTHING
     RETURNING id`,
    [
      interaction.workflowId,
      interaction.gateKey,
      interaction.topic,
      interaction.dedupeKey,
      interaction.payloadHash,
      interaction.payload
    ]
  );
  return (res.rowCount ?? 0) > 0;
}
