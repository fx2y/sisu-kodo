import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { insertIntent } from "../../src/db/intentRepo";
import { insertRun, updateRunStatus, findRunById } from "../../src/db/runRepo";
import { generateId } from "../../src/lib/id";

describe("run status monotonicity", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  test("updateRunStatus does not downgrade terminal -> nonterminal", async () => {
    const intentId = generateId("it_status");
    const runId = generateId("run_status");
    await insertIntent(pool, intentId, {
      goal: "status monotonic",
      inputs: {},
      constraints: {},
      connectors: []
    });
    await insertRun(pool, {
      id: runId,
      intent_id: intentId,
      workflow_id: intentId,
      status: "succeeded"
    });

    await updateRunStatus(pool, runId, "running");
    const row = await findRunById(pool, runId);
    expect(row?.status).toBe("succeeded");

    await updateRunStatus(pool, runId, "failed");
    const row2 = await findRunById(pool, runId);
    expect(row2?.status).toBe("failed");
  });
});
