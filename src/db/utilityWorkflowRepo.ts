import type { Pool } from "pg";

export async function ensureUtilitySleepRunContext(pool: Pool, workflowID: string): Promise<void> {
  const intentId = `it-utility-${workflowID}`;
  await pool.query(
    "INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [intentId, "utility-sleep", JSON.stringify({ inputs: {}, constraints: {} })]
  );
  await pool.query(
    "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    [workflowID, intentId, workflowID, "running"]
  );
}
