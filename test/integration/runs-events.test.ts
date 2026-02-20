import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
import { findRunById } from "../../src/db/runRepo";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";

let lc: TestLifecycle;

beforeAll(async () => {
  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
});

describe("HITL events integration", () => {
  test("workflow transitions to waiting_input and resumes on event", async () => {
    const intentId = generateId("it_ask");
    await insertIntent(lc.pool, intentId, {
      goal: "ask me something",
      inputs: {},
      constraints: {}
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      queuePartitionKey: "test-partition"
    });
    await approvePlan(lc.pool, runId, "test");

    // Wait for it to reach waiting_input
    let run = await findRunById(lc.pool, runId);
    for (let i = 0; i < 20; i++) {
      if (run?.status === "waiting_input") break;
      await new Promise((r) => setTimeout(r, 500));
      run = await findRunById(lc.pool, runId);
    }
    expect(run?.status).toBe("waiting_input");

    // Send event
    await lc.workflow.sendEvent(intentId, { type: "answer", payload: { text: "42" } });

    // Wait for completion
    await lc.workflow.waitUntilComplete(intentId, 20000);

    run = await findRunById(lc.pool, runId);
    expect(run?.status).toBe("succeeded");
  }, 30000);
});
