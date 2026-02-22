import type { Pool } from "pg";
import type { Intent } from "../contracts/intent.schema";
import { canonicalStringify } from "../lib/hash";

export type IntentRow = Intent & {
  id: string;
  intent_hash?: string | null;
  recipe_id?: string | null;
  recipe_v?: string | null;
  recipe_hash?: string | null;
  created_at: Date;
};

export async function insertIntent(pool: Pool, id: string, intent: Intent): Promise<IntentRow> {
  const { goal, inputs, constraints, connectors } = intent;
  const payload = { inputs, constraints, connectors };

  const res = await pool.query(
    `INSERT INTO app.intents (id, goal, payload) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (id) DO UPDATE SET
       goal = EXCLUDED.goal,
       payload = EXCLUDED.payload
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
    intent_hash: null,
    recipe_id: null,
    recipe_v: null,
    recipe_hash: null,
    created_at: row.created_at
  };
}

export async function upsertIntentByHash(
  pool: Pool,
  row: {
    id: string;
    intentHash: string;
    intent: Intent;
    recipeRef: { id: string; v: string };
    recipeHash: string;
  }
): Promise<IntentRow> {
  const payload = {
    inputs: row.intent.inputs,
    constraints: row.intent.constraints,
    connectors: row.intent.connectors
  };
  const insert = await pool.query(
    `INSERT INTO app.intents (id, goal, payload, intent_hash, recipe_id, recipe_v, recipe_hash, json)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (id) DO NOTHING
     RETURNING id, goal, payload, intent_hash, recipe_id, recipe_v, recipe_hash, created_at`,
    [
      row.id,
      row.intent.goal,
      JSON.stringify(payload),
      row.intentHash,
      row.recipeRef.id,
      row.recipeRef.v,
      row.recipeHash,
      canonicalStringify(row.intent)
    ]
  );
  if ((insert.rowCount ?? 0) > 0) {
    return fromRow(insert.rows[0]);
  }

  const existing = await findIntentById(pool, row.id);
  if (!existing) {
    throw new Error(`conflict on intent hash ${row.intentHash} but no row found`);
  }
  if (existing.intent_hash && existing.intent_hash !== row.intentHash) {
    throw new Error(`intent hash conflict with divergent hash: ${row.intentHash}`);
  }
  if (
    (existing.recipe_id && existing.recipe_id !== row.recipeRef.id) ||
    (existing.recipe_v && existing.recipe_v !== row.recipeRef.v) ||
    (existing.recipe_hash && existing.recipe_hash !== row.recipeHash)
  ) {
    throw new Error(`intent hash conflict with divergent recipe refs: ${row.intentHash}`);
  }
  const existingJson = JSON.parse(canonicalStringify(existing));
  const candidateJson = JSON.parse(
    canonicalStringify({ ...row.intent, id: existing.id })
  ) as Record<string, unknown>;
  if (
    canonicalStringify(existingJson.goal) !== canonicalStringify(candidateJson.goal) ||
    canonicalStringify(existingJson.inputs) !== canonicalStringify(candidateJson.inputs) ||
    canonicalStringify(existingJson.constraints) !== canonicalStringify(candidateJson.constraints)
  ) {
    throw new Error(`intent hash conflict with divergent payload: ${row.intentHash}`);
  }
  return existing;
}

export async function findIntentById(pool: Pool, id: string): Promise<IntentRow | undefined> {
  const res = await pool.query(
    `SELECT id, goal, payload, intent_hash, recipe_id, recipe_v, recipe_hash, created_at
     FROM app.intents WHERE id = $1`,
    [id]
  );

  if (res.rowCount === 0) return undefined;

  return fromRow(res.rows[0]);
}

export async function findIntentByHash(
  pool: Pool,
  intentHash: string
): Promise<IntentRow | undefined> {
  return findIntentById(pool, `ih_${intentHash}`);
}

function fromRow(row: Record<string, unknown>): IntentRow {
  const payload = row.payload as {
    inputs?: Record<string, unknown>;
    constraints?: Record<string, unknown>;
    connectors?: string[];
  };
  return {
    id: String(row.id),
    goal: String(row.goal),
    inputs: payload.inputs ?? {},
    constraints: payload.constraints ?? {},
    connectors: payload.connectors,
    intent_hash: (row.intent_hash as string | null | undefined) ?? null,
    recipe_id: (row.recipe_id as string | null | undefined) ?? null,
    recipe_v: (row.recipe_v as string | null | undefined) ?? null,
    recipe_hash: (row.recipe_hash as string | null | undefined) ?? null,
    created_at: row.created_at as Date
  };
}
