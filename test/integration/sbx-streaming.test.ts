import { afterAll, beforeAll, describe, expect, test, beforeEach } from "vitest";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { OCMockDaemon } from "../oc-mock-daemon";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";

import { setRngSeed } from "../../src/lib/rng";

let lc: TestLifecycle;
let daemon: OCMockDaemon;
const daemonPort = 4198;

beforeAll(async () => {
  setRngSeed(Date.now());
  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";
  IntentSteps.resetImpl();

  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
  await daemon.stop();
});

beforeEach(async () => {
  await lc.pool.query(
    "TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts, app.sbx_runs CASCADE"
  );
});

describe("sbx streaming", () => {
  test("emits stdout chunks during execution", async () => {
    // We use Date.now() to ensure uniqueness across test runs since IDs are seeded.
    const uniqueSuffix = Date.now().toString(16);
    const intentId = `it_stream_${uniqueSuffix}_${generateId("it")}`;
    await insertIntent(lc.pool, intentId, {
      goal: "streaming test",
      inputs: {},
      constraints: {},
      connectors: []
    });

    daemon.pushResponse({
      info: {
        id: "msg-plan-ok",
        structured_output: {
          goal: "streaming test",
          design: ["design"],
          files: ["file.ts"],
          risks: ["none"],
          tests: []
        }
      },
      usage: { total_tokens: 123 }
    });

    daemon.pushResponse({
      info: {
        id: "msg-build-stream",
        structured_output: {
          patch: [],
          tests: [],
          test_command: "echo hello"
        }
      },
      usage: { total_tokens: 456 }
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      recipeName: "sandbox-default",
      queueName: "intentQ",
      queuePartitionKey: "stream-test"
    });

    // Start reading status stream in background as soon as we have intentId
    const statusChunks: any[] = [];
    const statusReader = (async () => {
      try {
        for await (const chunk of lc.workflow.readStream(intentId, "status")) {
          statusChunks.push(chunk);
        }
      } catch (e) {
        // Ignore read errors
      }
    })();

    // 1. Wait for gate
    const { findLatestGateByRunId } = await import("../../src/db/humanGateRepo");
    let gate = null;
    for (let i = 0; i < 40; i++) {
      gate = await findLatestGateByRunId(lc.pool, runId);
      if (gate) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(gate).not.toBeNull();
    const gateKey = gate!.gate_key;
    const topic = gate!.topic;

    // 2. Send approval reply
    const payload = { choice: "yes", rationale: "test" };
    await lc.workflow.sendMessage(intentId, payload, topic, `dedupe-${intentId}`);

    // Wait for completion
    await lc.workflow.waitUntilComplete(intentId, 25000);
    await statusReader;

    const sbxRun = await lc.pool.query("SELECT task_key FROM app.sbx_runs WHERE run_id = $1", [
      runId
    ]);
    expect(sbxRun.rows.length).toBe(1);
    const taskKey = sbxRun.rows[0].task_key;

    // For stdout, since it's already closed, let's see if we can still read it (buffered)
    const stdoutChunks: any[] = [];
    for await (const chunk of lc.workflow.readStream(taskKey, "stdout")) {
      stdoutChunks.push(chunk);
    }

    expect(stdoutChunks.length).toBeGreaterThanOrEqual(1);
    const firstChunk = stdoutChunks.find((c) => c.kind === "stdout");
    expect(firstChunk.kind).toBe("stdout");
    expect(firstChunk.chunk).toContain("OK: echo hello");
    expect(firstChunk.seq).toBe(0);

    // Check status events
    expect(statusChunks.length).toBeGreaterThanOrEqual(2);
    const statuses = statusChunks.map((c) => c.status);
    expect(statuses).toContain("running");
    expect(statuses).toContain("succeeded");
  }, 30000);
});
