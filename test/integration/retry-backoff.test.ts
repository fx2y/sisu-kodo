import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { resetMockInjectedFailCount } from "../../src/sbx/providers/mock";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { RunIntentStepsImpl } from "../../src/workflow/steps/run-intent.steps";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import type { OCClientPort } from "../../src/oc/port";
import type { OCRunInput, OCRunOutput, PromptStructuredOptions } from "../../src/oc/port";
import type { OCOutput } from "../../src/oc/schema";

let lc: TestLifecycle;

beforeAll(async () => {
  lc = await setupLifecycle(30);
});

afterAll(async () => {
  await teardownLifecycle(lc);
});

class MockOCPort implements OCClientPort {
  async health(): Promise<void> {}
  async run(_params: OCRunInput): Promise<OCRunOutput> {
    return { key: "test", payload: { prompt: "", toolcalls: [], responses: [], diffs: [] } };
  }
  async createSession(_runId: string, _title: string): Promise<string> {
    return "test-sess";
  }
  async promptStructured(
    _sessionId: string,
    _prompt: string,
    _schema: Record<string, unknown>,
    options: PromptStructuredOptions
  ): Promise<OCOutput> {
    const base = { prompt: "test", toolcalls: [], responses: [], diffs: [] };
    if (options.stepId === "CompileST") {
      return { ...base, structured: { design: ["Design"], files: [], risks: [], tests: [] } };
    }
    if (options.stepId === "DecideST") {
      return { ...base, structured: { patch: [], tests: [], test_command: "INFRA_FAIL" } };
    }
    return { ...base, structured: {} };
  }
  async revert(_sessionId: string, _messageId: string): Promise<void> {}
  async log(_message: string, _level?: string): Promise<void> {}
  async agents(): Promise<string[]> {
    return ["plan", "build"];
  }
}

describe("Retry backoff and exhaust proof", () => {
  test("exhausts attempts with monotonic backoff spacing", async () => {
    resetMockInjectedFailCount();
    const mockOC = new MockOCPort();
    IntentSteps.setImpl(new RunIntentStepsImpl(mockOC));

    const intentId = generateId("it_backoff");
    await insertIntent(lc.pool, intentId, {
      goal: "always fail with infra error",
      inputs: {},
      constraints: {}
    });

    const run = await startIntentRun(lc.pool, lc.workflow, intentId, {
      traceId: generateId("tr"),
      queuePartitionKey: "test-partition"
    });
    await approvePlan(lc.pool, run.runId, "test");

    // Wait for terminal failure after retry exhaustion.
    await expect(lc.workflow.waitUntilComplete(intentId, 20000)).rejects.toBeInstanceOf(Error);

    const runRow = await lc.pool.query<{ status: string; next_action: string }>(
      "SELECT status, next_action FROM app.runs WHERE id = $1",
      [run.runId]
    );
    // Normalized in C4.T2: retries_exceeded status and REPAIR nextAction
    expect(runRow.rows[0].status).toBe("retries_exceeded");
    expect(runRow.rows[0].next_action).toBe("REPAIR");

    const sbxRuns = await lc.pool.query<{ attempt: number; created_at: Date }>(
      "SELECT attempt, created_at FROM app.sbx_runs WHERE run_id = $1 ORDER BY attempt ASC",
      [run.runId]
    );

    // Should have 3 attempts (maxAttempts: 3 in IntentSteps.executeTask)
    expect(sbxRuns.rowCount).toBe(3);

    const t1 = sbxRuns.rows[0].created_at.getTime();
    const t2 = sbxRuns.rows[1].created_at.getTime();
    const t3 = sbxRuns.rows[2].created_at.getTime();

    const d1 = t2 - t1;
    const d2 = t3 - t2;

    // intervalSeconds: 1, backoffRate: 2
    // d1 should be ~1s
    // d2 should be ~2s (after 1s * 2 backoff)

    // We use generous tolerances because DBOS scheduling and local machine load can vary
    expect(d1).toBeGreaterThanOrEqual(800);
    expect(d2).toBeGreaterThanOrEqual(1800);
    expect(d2).toBeGreaterThan(d1);

    IntentSteps.resetImpl();
  }, 40000);
});
