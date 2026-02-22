import type { Pool } from "pg";
import { normalizeHitlGateKey, toHumanTopic } from "../lib/hitl-topic";

export interface HumanGate {
  run_id: string;
  gate_key: string;
  topic: string;
  created_at: Date;
}

export interface HumanInteraction {
  id: string;
  workflow_id: string;
  run_id: string | null;
  gate_key: string;
  topic: string;
  dedupe_key: string;
  payload_hash: string;
  payload: unknown;
  origin: string;
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
    "SELECT run_id, gate_key, topic, created_at FROM app.human_gates WHERE run_id = $1 ORDER BY created_at DESC, gate_key DESC LIMIT 1",
    [runId]
  );
  return res.rows[0] ?? null;
}

export async function findGatesByRunId(pool: Pool, runId: string): Promise<HumanGate[]> {
  const res = await pool.query<HumanGate>(
    "SELECT run_id, gate_key, topic, created_at FROM app.human_gates WHERE run_id = $1 ORDER BY created_at ASC",
    [runId]
  );
  return res.rows;
}

export async function insertHumanInteraction(
  pool: Pool,
  interaction: {
    workflowId: string;
    runId?: string;
    gateKey: string;
    topic: string;
    dedupeKey: string;
    payloadHash: string;
    payload: unknown;
    origin: string;
  }
): Promise<{ inserted: boolean; interaction: HumanInteraction }> {
  const normGateKey = normalizeHitlGateKey(interaction.gateKey);
  const normTopic = interaction.topic.startsWith("human:")
    ? toHumanTopic(normGateKey)
    : interaction.topic;

  const driftRes = await pool.query<HumanInteraction>(
    `SELECT id, workflow_id, run_id, gate_key, topic, dedupe_key, payload_hash, payload, origin, created_at
       FROM app.human_interactions
      WHERE workflow_id = $1 AND gate_key = $2 AND dedupe_key = $3
      ORDER BY created_at DESC
      LIMIT 1`,
    [interaction.workflowId, normGateKey, interaction.dedupeKey]
  );
  const driftRow = driftRes.rows[0];
  if (
    driftRow &&
    (driftRow.topic !== normTopic || driftRow.payload_hash !== interaction.payloadHash)
  ) {
    throw new Error("dedupeKey conflict: drift on topic or payload");
  }

  const insertRes = await pool.query<HumanInteraction>(
    `INSERT INTO app.human_interactions
       (workflow_id, run_id, gate_key, topic, dedupe_key, payload_hash, payload, origin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (workflow_id, gate_key, topic, dedupe_key) DO NOTHING
     RETURNING id, workflow_id, run_id, gate_key, topic, dedupe_key, payload_hash, payload, origin, created_at`,
    [
      interaction.workflowId,
      interaction.runId ?? null,
      normGateKey,
      normTopic,
      interaction.dedupeKey,
      interaction.payloadHash,
      interaction.payload,
      interaction.origin
    ]
  );

  if ((insertRes.rowCount ?? 0) > 0) {
    return { inserted: true, interaction: insertRes.rows[0] };
  }

  // NOTE: This must be a separate statement (not a same-statement CTE fallback).
  // Under concurrent duplicate inserts, a single-statement snapshot can miss the winner row.
  const existingRes = await pool.query<HumanInteraction>(
    `SELECT id, workflow_id, run_id, gate_key, topic, dedupe_key, payload_hash, payload, origin, created_at
       FROM app.human_interactions
      WHERE workflow_id = $1 AND gate_key = $2 AND topic = $3 AND dedupe_key = $4`,
    [interaction.workflowId, normGateKey, normTopic, interaction.dedupeKey]
  );

  if ((existingRes.rowCount ?? 0) === 0) {
    throw new Error("Failed to insert or find human interaction");
  }
  const existing = existingRes.rows[0];
  if (existing.topic !== normTopic || existing.payload_hash !== interaction.payloadHash) {
    throw new Error("dedupeKey conflict: drift on topic or payload");
  }

  return { inserted: false, interaction: existing };
}
