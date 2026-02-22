import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
import { generateId } from "../../src/lib/id";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { toHitlPromptKey, toHitlDecisionKey } from "../../src/workflow/hitl/keys";
import { buildGateKey } from "../../src/workflow/hitl/gate-key";
import type { GateDecision } from "../../src/contracts/hitl/gate-decision.schema";

let lc: TestLifecycle;

beforeAll(async () => {
  process.env.HITL_PLAN_APPROVAL_TIMEOUT_S = "2";
  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
  delete process.env.HITL_PLAN_APPROVAL_TIMEOUT_S;
});

describe("HITL timeout escalation", () => {
  test("timeout triggers escalation and persists decision", async () => {
    const intentId = generateId("it_timeout");
    await insertIntent(lc.pool, intentId, {
      goal: "wait for timeout",
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

    let prompt = null;
    for (let i = 0; i < 40; i++) {
      prompt = await lc.workflow.getEvent(intentId, promptKey, 0);
      if (prompt) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(prompt).not.toBeNull();

    // 2. Wait for workflow to time out and fail
    try {
      await lc.workflow.waitUntilComplete(intentId, 15000);
    } catch (_e) {
      // expected failure
    }

    // 3. Verify decision was persisted as timeout
    const decision = await lc.workflow.getEvent<GateDecision>(intentId, decisionKey, 0);
    expect(decision).toMatchObject({ decision: "no", payload: { rationale: "timeout" } });

    // 4. Verify run failed
    const status = await lc.workflow.getWorkflowStatus(intentId);
    expect(status).toBe("ERROR");

    // 5. Verify escalation workflow was enqueued (workflowID check)
    const escWorkflowId = `esc:${intentId}:${gateKey}`;
    let escWf = null;
    for (let i = 0; i < 40; i++) {
      const escStatus = await lc.sysPool.query(
        "SELECT workflow_uuid, status FROM dbos.workflow_status WHERE workflow_uuid = $1",
        [escWorkflowId]
      );
      if (escStatus.rowCount && escStatus.rowCount > 0 && escStatus.rows[0].status === "SUCCESS") {
        escWf = escStatus.rows[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(escWf).not.toBeNull();

    // 6. Verify escalation artifact exists
    const artifactRes = await lc.pool.query(
      "SELECT 1 FROM app.artifacts WHERE run_id = $1 AND step_id = 'EscalateTimeout'",
      [runId]
    );
    expect(artifactRes.rowCount).toBeGreaterThan(0);
  }, 40000);
});
