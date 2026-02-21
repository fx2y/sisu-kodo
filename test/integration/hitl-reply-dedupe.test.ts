import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
import { findRunById } from "../../src/db/runRepo";
import { generateId } from "../../src/lib/id";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { findLatestGateByRunId } from "../../src/db/humanGateRepo";

let lc: TestLifecycle;

beforeAll(async () => {
  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
});

describe("HITL reply dedupe", () => {
  test("duplicate replies with same dedupeKey exactly-once effect", async () => {
    const intentId = generateId("it_dedupe");
    await insertIntent(lc.pool, intentId, {
      goal: "simple goal",
      inputs: {},
      constraints: {}
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      queuePartitionKey: "test-partition"
    });

    // 1. Wait for plan approval gate to open
    let gate = null;
    for (let i = 0; i < 40; i++) {
      gate = await findLatestGateByRunId(lc.pool, runId);
      if (gate) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(gate).not.toBeNull();
    const topic = gate!.topic;

    // 2. Send duplicate replies
    const dedupeKey = `dedupe-${runId}`;
    const payload = { approved: true, approvedBy: "test-bot" };

    // Send 3 times in parallel-ish
    await Promise.all([
      lc.workflow.sendMessage(intentId, payload, topic, dedupeKey),
      lc.workflow.sendMessage(intentId, payload, topic, dedupeKey),
      lc.workflow.sendMessage(intentId, payload, topic, dedupeKey)
    ]);

    // 3. Verify exactly-once in our ledger
    const interactions = await lc.pool.query(
      "SELECT count(*) FROM app.human_interactions WHERE workflow_id = $1 AND dedupe_key = $2",
      [intentId, dedupeKey]
    );
    expect(interactions.rows[0].count).toBe("1");

    // 4. Wait for completion
    await lc.workflow.waitUntilComplete(intentId, 20000);

    const run = await findRunById(lc.pool, runId);
    expect(run?.status).toBe("succeeded");

    // 5. Verify result event is persisted
    const resultKey = `ui:${gate!.gate_key}:result`;
    const resultEvent = await lc.workflow.getEvent(intentId, resultKey, 0);
    expect(resultEvent).toMatchObject({ state: "RECEIVED", payload });
  }, 30000);
});
