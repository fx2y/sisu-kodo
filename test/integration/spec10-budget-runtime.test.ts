import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { setRngSeed } from "../../src/lib/rng";
import { OCMockDaemon } from "../oc-mock-daemon";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";

let lc: TestLifecycle;
let daemon: OCMockDaemon;
const daemonPort = 4298;

beforeAll(async () => {
  setRngSeed(0x54f40000 + Number(process.env.PORT ?? 0));
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";
  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();
  IntentSteps.resetImpl();
  lc = await setupLifecycle(20);
  await lc.pool.query("ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS budget JSONB");
});

afterAll(async () => {
  await teardownLifecycle(lc);
  await daemon.stop();
  await IntentSteps.teardown();
});

describe("CY4 budget runtime", () => {
  test("runtime fanout budget stop emits BUDGET artifact evidence", async () => {
    const intentId = generateId("it_cy4_budget");
    await insertIntent(lc.pool, intentId, { goal: "fanout me", inputs: {}, constraints: {} });

    daemon.pushAgentResponse("plan", {
      info: {
        id: "cy4-plan",
        structured_output: {
          goal: "fanout me",
          design: ["d"],
          files: ["f.ts"],
          risks: ["r"],
          tests: ["t1.ts", "t2.ts"]
        },
        tool_calls: []
      },
      messages: [{ type: "text", text: "ok" }],
      usage: { total_tokens: 10 }
    });
    daemon.pushAgentResponse("build", {
      info: {
        id: "cy4-build",
        structured_output: {
          patch: [],
          tests: ["a.test.ts", "b.test.ts"],
          test_command: "echo ok"
        },
        tool_calls: []
      },
      messages: [{ type: "text", text: "ok" }],
      usage: { total_tokens: 10 }
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      recipeName: "sandbox-default",
      queueName: "intentQ",
      queuePartitionKey: "tenant-cy4-runtime",
      workload: { concurrency: 1, steps: 1, sandboxMinutes: 1 },
      budget: {
        maxFanout: 1,
        maxSBXMinutes: 10,
        maxArtifactsMB: 10,
        maxRetriesPerStep: 2,
        maxWallClockMS: 30000
      }
    });
    await approvePlan(lc.pool, runId, "test");

    await expect(lc.workflow.waitUntilComplete(intentId, 30000)).rejects.toThrow();

    const runRow = await lc.pool.query(
      "SELECT status, next_action FROM app.runs WHERE id = $1",
      [runId]
    );
    expect(runRow.rows[0].status).toBe("retries_exceeded");
    expect(runRow.rows[0].next_action).toBe("REPAIR");

    const arts = await lc.pool.query(
      `SELECT step_id, kind, inline
         FROM app.artifacts
        WHERE run_id = $1 AND step_id = 'BUDGET'
        ORDER BY created_at ASC`,
      [runId]
    );
    expect(arts.rowCount).toBeGreaterThan(0);
    const payload = arts.rows[0].inline?.json ?? arts.rows[0].inline;
    expect(payload.kind).toBe("budget");
    expect(payload.metric).toBe("maxFanout");
    expect(payload.limit).toBe(1);
    expect(payload.observed).toBe(2);
    expect(payload.outcome).toBe("blocked");
  });
});
