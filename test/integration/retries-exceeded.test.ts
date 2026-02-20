import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
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

describe("workflow recovery caps and retries exceeded", () => {
  test("run projects terminal retries_exceeded + repair action", async () => {
    const intentId = generateId("it_fail");
    await insertIntent(lc.pool, intentId, {
      goal: "fail me",
      inputs: { cmd: "FAIL_ME" },
      constraints: {}
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      traceId: "test-fail-trace",
      queuePartitionKey: "test-partition"
    });
    await approvePlan(lc.pool, runId, "test");

    // Use waitUntilComplete instead of manual polling
    try {
      await lc.workflow.waitUntilComplete(intentId, 25000);
    } catch (_e) {
      // Expected failure path in this test
    }

    const run = await findRunById(lc.pool, runId);
    expect(run).toBeDefined();
    expect(run?.status).toBe("retries_exceeded");
    expect(run?.retry_count).toBe(0);
    expect(run?.error).toBe("SBX execution failed [CMD_NONZERO]");
    expect(run?.next_action).toBe("REPAIR");
  }, 30000);
});
