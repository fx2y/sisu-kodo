import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { findLatestGateByRunId } from "../../src/db/humanGateRepo";
import { insertIntent } from "../../src/db/intentRepo";
import { insertRun } from "../../src/db/runRepo";
import { generateId } from "../../src/lib/id";

describe("human gate latest ordering", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  test("ties on created_at use deterministic gate_key tie-break", async () => {
    const intentId = generateId("it_gate_order");
    const runId = generateId("run_gate_order");
    await insertIntent(pool, intentId, {
      goal: "gate-order",
      inputs: {},
      constraints: {},
      connectors: []
    });
    await insertRun(pool, {
      id: runId,
      intent_id: intentId,
      workflow_id: intentId,
      status: "waiting_input"
    });

    await pool.query(
      `INSERT INTO app.human_gates (run_id, gate_key, topic, created_at)
       VALUES ($1, $2, $3, $4), ($1, $5, $6, $4)`,
      [
        runId,
        "ui:a",
        "human:ui:a",
        new Date("2026-02-22T00:00:00.000Z"),
        "ui:z",
        "human:ui:z"
      ]
    );

    const latest = await findLatestGateByRunId(pool, runId);
    expect(latest?.gate_key).toBe("ui:z");
  });
});
