import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { generateId } from "../../src/lib/id";
import { OCMockDaemon } from "../oc-mock-daemon";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { findLatestGateByRunId } from "../../src/db/humanGateRepo";
import { toHitlResultKey } from "../../src/workflow/hitl/keys";

let lc: TestLifecycle;
let daemon: OCMockDaemon;
const daemonPort = 4205;

beforeAll(async () => {
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

describe("C5: Stream + Receiver Proofs", () => {
  test("Bet F: Stream restart and status update", async () => {
    const intentId = generateId("it_c5_stream");
    await insertIntent(lc.pool, intentId, {
      goal: "test stream restart",
      inputs: {},
      constraints: {}
    });

    daemon.pushResponse({
      info: {
        id: "p1",
        structured_output: { goal: "test", design: ["d"], files: ["f.ts"], risks: ["n"], tests: [] }
      },
      usage: { total_tokens: 1 }
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      recipeName: "compile-default",
      queueName: "intentQ",
      queuePartitionKey: "c5-stream"
    });

    // 1. Start status stream reader
    const statusChunks: unknown[] = [];
    const statusReader = (async () => {
      try {
        for await (const chunk of lc.workflow.readStream(intentId, "status")) {
          statusChunks.push(chunk);
        }
      } catch (_e) {
        // Ignore stream-read teardown races.
      }
    })();

    // 2. Wait for gate
    let gate = null;
    for (let i = 0; i < 40; i++) {
      gate = await findLatestGateByRunId(lc.pool, runId);
      if (gate) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(gate).not.toBeNull();

    // 3. Send approval via status-aware lane
    const payload = { choice: "yes", rationale: "stream-proof" };
    await lc.workflow.sendMessage(intentId, payload, gate!.topic, `dedupe-${intentId}`);

    // 4. Wait for completion
    await lc.workflow.waitUntilComplete(intentId, 15000);
    await statusReader;

    expect(statusChunks.length).toBeGreaterThanOrEqual(2);
    const statuses = statusChunks.map((chunk) =>
      typeof chunk === "object" && chunk !== null && "status" in chunk
        ? String((chunk as { status?: unknown }).status)
        : undefined
    );
    expect(statuses).toContain("running");
    expect(statuses).toContain("succeeded");
  }, 30000);

  test("Bet G: Webhook receiver exactly-once + unification", async () => {
    const intentId = generateId("it_c5_webhook");
    await insertIntent(lc.pool, intentId, {
      goal: "test webhook receiver",
      inputs: {},
      constraints: {}
    });

    daemon.pushResponse({
      info: {
        id: "p1",
        structured_output: { goal: "test", design: ["d"], files: ["f.ts"], risks: ["n"], tests: [] }
      },
      usage: { total_tokens: 1 }
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      recipeName: "compile-default",
      queueName: "intentQ",
      queuePartitionKey: "c5-webhook"
    });

    // 1. Wait for gate
    let gate = null;
    for (let i = 0; i < 40; i++) {
      gate = await findLatestGateByRunId(lc.pool, runId);
      if (gate) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(gate).not.toBeNull();

    // 2. Simulate webhook POST to /api/events/hitl (by calling service directly or mock app)
    // We'll use the service layer to verify the unification
    const { postExternalEventService } = await import("../../src/server/ui-api");
    const dedupeKey = `webhook-${intentId}`;
    const payload = { choice: "yes", rationale: "webhook-proof" };

    // First delivery
    await postExternalEventService(lc.pool, lc.workflow, {
      workflowId: intentId,
      gateKey: gate!.gate_key,
      topic: gate!.topic,
      payload,
      dedupeKey,
      origin: "webhook-ci"
    });

    // Second delivery (replay)
    await postExternalEventService(lc.pool, lc.workflow, {
      workflowId: intentId,
      gateKey: gate!.gate_key,
      topic: gate!.topic,
      payload,
      dedupeKey,
      origin: "webhook-ci"
    });

    // 3. Verify interaction ledger (Only one row!)
    const interactions = await lc.pool.query(
      "SELECT count(*) FROM app.human_interactions WHERE workflow_id = $1 AND dedupe_key = $2",
      [intentId, dedupeKey]
    );
    expect(interactions.rows[0].count).toBe("1");

    // 4. Verify resume + completion
    await lc.workflow.waitUntilComplete(intentId, 15000);

    const resultKey = toHitlResultKey(gate!.gate_key);
    const result = await lc.workflow.getEvent(intentId, resultKey, 0);
    expect(result).toMatchObject({ state: "RECEIVED", payload });
  }, 30000);
});
