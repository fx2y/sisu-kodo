import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Pool } from "pg";
import { closePool, createPool } from "../../src/db/pool";
import { insertIntent } from "../../src/db/intentRepo";
import { insertRun } from "../../src/db/runRepo";
import { approvePlan, isPlanApproved } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";

describe("plan approval repo", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  test("upserts approval and reports approval state", async () => {
    const intentId = generateId("it_plan_repo");
    const runId = generateId("run_plan_repo");
    await insertIntent(pool, intentId, { goal: "repo test", inputs: {}, constraints: {} });
    await insertRun(pool, {
      id: runId,
      intent_id: intentId,
      workflow_id: intentId,
      status: "queued"
    });

    expect(await isPlanApproved(pool, runId)).toBe(false);

    const first = await approvePlan(pool, runId, "alice", "first");
    expect(first).toBeInstanceOf(Date);
    expect(await isPlanApproved(pool, runId)).toBe(true);

    const second = await approvePlan(pool, runId, "bob", "second");
    expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());

    const row = await pool.query<{ approved_by: string; notes: string }>(
      "SELECT approved_by, notes FROM app.plan_approvals WHERE run_id = $1",
      [runId]
    );
    expect(row.rows[0]).toEqual({ approved_by: "bob", notes: "second" });
  });
});
