import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
import { generateId } from "../../src/lib/id";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { toHitlPromptKey, toHitlDecisionKey } from "../../src/workflow/hitl/keys";
import { buildGateKey } from "../../src/workflow/hitl/gate-key";
import { toHumanTopic } from "../../src/lib/hitl-topic";
import type { HumanDecision } from "../../src/workflow/wf/hitl-gates";

let lc: TestLifecycle;

beforeAll(async () => {
  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
});

describe("HITL approve decision branching", () => {
  test("approve:yes leads to success", async () => {
    const intentId = generateId("it_yes");
    await insertIntent(lc.pool, intentId, {
      goal: "approve me yes",
      inputs: {},
      constraints: {}
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      queuePartitionKey: "test-partition"
    });

    // 1. Wait for prompt
    const gateKey = buildGateKey(runId, "ApplyPatchST", "approve-plan", 1);
    const promptKey = toHitlPromptKey(gateKey);
    const decisionKey = toHitlDecisionKey(gateKey);
    const topic = toHumanTopic(gateKey);

    let prompt = null;
    for (let i = 0; i < 40; i++) {
      prompt = await lc.workflow.getEvent(intentId, promptKey, 0);
      if (prompt) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(prompt).not.toBeNull();

    // 2. Send approval
    await lc.workflow.sendMessage(
      intentId,
      { choice: "yes", rationale: "looks good" },
      topic,
      "dedupe-yes"
    );

    // 3. Wait for workflow to complete
    await lc.workflow.waitUntilComplete(intentId, 10000);

    // 4. Verify decision was persisted
    const decision = await lc.workflow.getEvent<HumanDecision>(intentId, decisionKey, 0);
    expect(decision).toMatchObject({ choice: "yes", rationale: "looks good" });

    // 5. Verify run succeeded
    const status = await lc.workflow.getWorkflowStatus(intentId);
    expect(status).toBe("SUCCESS");

    // 6. Verify interaction ledgering
    const interactions = await lc.pool.query(
      "SELECT * FROM app.human_interactions WHERE workflow_id = $1",
      [intentId]
    );
    expect(interactions.rowCount).toBeGreaterThan(0);
    expect(interactions.rows[0].gate_key).toBe(gateKey);
    expect(interactions.rows[0].dedupe_key).toBe("dedupe-yes");
    expect(interactions.rows[0].run_id).toBe(runId);
    expect(interactions.rows[0].origin).toBeDefined();
  }, 30000);

  test("approve:no leads to failure", async () => {
    const intentId = generateId("it_no");
    await insertIntent(lc.pool, intentId, {
      goal: "approve me no",
      inputs: {},
      constraints: {}
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      queuePartitionKey: "test-partition"
    });

    // 1. Wait for prompt
    const gateKey = buildGateKey(runId, "ApplyPatchST", "approve-plan", 1);
    const promptKey = toHitlPromptKey(gateKey);
    const topic = toHumanTopic(gateKey);

    let prompt = null;
    for (let i = 0; i < 40; i++) {
      prompt = await lc.workflow.getEvent(intentId, promptKey, 0);
      if (prompt) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(prompt).not.toBeNull();

    // 2. Send rejection
    await lc.workflow.sendMessage(
      intentId,
      { choice: "no", rationale: "bad plan" },
      topic,
      "dedupe-no"
    );

    // 3. Wait for workflow to complete (should fail)
    try {
      await lc.workflow.waitUntilComplete(intentId, 10000);
    } catch (_e) {
      // expected failure
    }

    // 4. Verify run failed
    const status = await lc.workflow.getWorkflowStatus(intentId);
    expect(status).toBe("ERROR");

    const runRes = await lc.pool.query("SELECT error FROM app.runs WHERE workflow_id = $1", [
      intentId
    ]);
    expect(runRes.rows[0].error).toContain("Plan approval failed: no");
  }, 30000);
});
