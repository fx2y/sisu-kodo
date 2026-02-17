import type { Pool } from "pg";
import type { Intent } from "../contracts/intent.schema";

export type IntentRow = Intent & {
  id: string;
  created_at: Date;
};

export async function insertIntent(pool: Pool, id: string, intent: Intent): Promise<IntentRow> {
  const { goal, inputs, constraints, connectors } = intent;
  const payload = { inputs, constraints, connectors };

  const res = await pool.query(
    `INSERT INTO app.intents (id, goal, payload) 
     VALUES ($1, $2, $3) 
     RETURNING id, goal, payload, created_at`,
    [id, goal, JSON.stringify(payload)]
  );

  const row = res.rows[0];
  return {
    id: row.id,
    goal: row.goal,
    inputs: row.payload.inputs,
    constraints: row.payload.constraints,
    connectors: row.payload.connectors,
    created_at: row.created_at
  };
}

export async function findIntentById(pool: Pool, id: string): Promise<IntentRow | undefined> {
  const res = await pool.query(
    `SELECT id, goal, payload, created_at FROM app.intents WHERE id = $1`,
    [id]
  );

  if (res.rowCount === 0) return undefined;

  const row = res.rows[0];
  return {
    id: row.id,
    goal: row.goal,
    inputs: row.payload.inputs,
    constraints: row.payload.constraints,
    connectors: row.payload.connectors,
    created_at: row.created_at
  };
}
