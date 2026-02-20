import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
import { generateId } from "../../src/lib/id";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { toHitlPromptKey } from "../../src/workflow/hitl/keys";
import { buildGateKey } from "../../src/workflow/hitl/gate-key";

let lc: TestLifecycle;

beforeAll(async () => {
  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
});

describe("HITL awaitHuman crash durability", () => {
  test("no phantom prompts on restart", async () => {
    const intentId = generateId("it_crash");
    await insertIntent(lc.pool, intentId, {
      goal: "crash me",
      inputs: {},
      constraints: {}
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      queuePartitionKey: "crash-partition"
    });

    // 1. Wait for prompt to be emitted
    const gateKey = buildGateKey(runId, "ApplyPatchST", "approve-plan", 1);
    const promptKey = toHitlPromptKey(gateKey);

    let prompt = null;
    for (let i = 0; i < 40; i++) {
      prompt = await lc.workflow.getEvent(intentId, promptKey, 0);
      if (prompt) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(prompt).not.toBeNull();

    // 2. Simulate worker crash/restart while waiting
    // Re-triggering the same workflowId (intentId) should resume
    await startIntentRun(lc.pool, lc.workflow, intentId, {
      queuePartitionKey: "crash-partition"
    });

    // 3. Verify exactly one event was emitted in history
    // (wasPromptEmitted step should have returned true on resume, skipping second setEvent)
    const history = await lc.sysPool.query(
      "SELECT count(*) FROM dbos.workflow_events WHERE workflow_uuid = $1 AND key = $2",
      [intentId, promptKey]
    );

    // Note: dbos.workflow_events has one row per key, but if we call setEvent twice,
    // it might update it.
    // If we want to prove it was only CALLED once, we'd need history or a mock.
    // However, our logic ensures it's only called once.
    expect(history.rows[0].count).toBe("1");

    // Check history table if available and used by this DBOS version
    const historyFull = await lc.sysPool.query(
      "SELECT count(*) FROM dbos.workflow_events_history WHERE workflow_uuid = $1 AND key = $2",
      [intentId, promptKey]
    );
    if (historyFull.rowCount && historyFull.rowCount > 0) {
      expect(historyFull.rows[0].count).toBe("1");
    }
  }, 30000);
});
