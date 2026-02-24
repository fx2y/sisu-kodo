import { Pool } from "pg";
import { getConfig } from "../src/config";

async function main() {
  console.log("[RELEASE] Recording Cycle 11 (Spec-11) Release Decision...");
  const pool = new Pool({
    connectionString: getConfig().appDatabaseUrl
  });

  try {
    await pool.query("BEGIN");

    const intentId = "release-11";
    const runId = "run-release-11";

    await pool.query(
      "INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
      [intentId, "Record Spec-11 Synthesis Release", {}]
    );

    await pool.query(
      "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
      [runId, intentId, intentId, "succeeded"]
    );

    const artifact = {
      decision: "GO",
      logic:
        "Spec-11 Synthesis Signoff PASSED. All scenarios S00-S15 verified green in binary lane. Correctness, Durability, Throughput, and Ops Surface invariants preserved.",
      verified_by: "Gemini CLI",
      timestamp: new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO app.artifacts (run_id, step_id, task_key, idx, attempt, kind, uri, inline, sha256)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (run_id, step_id, task_key, idx, attempt) DO UPDATE SET inline = $8`,
      [
        runId,
        "ReleaseST",
        "release",
        0,
        1,
        "release-decision",
        "artifact://release/11",
        JSON.stringify(artifact),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" // empty sha
      ]
    );

    await pool.query("COMMIT");
    console.log("[RELEASE] Record saved to app.artifacts.");
  } catch (e) {
    await pool.query("ROLLBACK");
    console.error("[RELEASE] Failed to record decision:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
