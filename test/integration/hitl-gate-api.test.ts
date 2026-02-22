import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { DBOSClientWorkflowEngine } from "../../src/api-shim/dbos-client";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { generateId } from "../../src/lib/id";
import { findLatestGateByRunId } from "../../src/db/humanGateRepo";
import { toHitlResultKey } from "../../src/workflow/hitl/keys";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;
let workflow: DBOSWorkflowEngine;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
}, 60000);

describe("HITL Gate API (Cycle C3)", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}/api`;

  test("GET /api/runs/:wid/gates/:gateKey returns GateView", async () => {
    const intentId = generateId("it_gate_get");
    await insertIntent(pool, intentId, { goal: "test gate get", inputs: {}, constraints: {} });
    const { runId } = await startIntentRun(pool, workflow, intentId, {
      recipeName: "compile-default",
      queueName: "intentQ",
      queuePartitionKey: "test-partition"
    });

    // 1. Wait for gate
    let gate = null;
    for (let i = 0; i < 40; i++) {
      gate = await findLatestGateByRunId(pool, runId);
      if (gate) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(gate).not.toBeNull();
    const gateKey = gate!.gate_key;

    // 2. Call GET endpoint
    const res = await fetch(`${baseUrl}/runs/${intentId}/gates/${gateKey}`);
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.workflowID).toBe(intentId);
    expect(view.gateKey).toBe(gateKey);
    expect(view.state).toBe("PENDING");
    expect(view.prompt).toBeDefined();
    expect(view.prompt.formSchema).toBeDefined();

    // Complete the workflow to avoid leaking a waiting gate into global teardown.
    const closeRes = await fetch(`${baseUrl}/runs/${intentId}/gates/${gateKey}/reply`, {
      method: "POST",
      body: JSON.stringify({
        payload: { choice: "yes", rationale: "gate-get-cleanup" },
        dedupeKey: `gate-get-cleanup-${intentId}`
      }),
      headers: { "content-type": "application/json" }
    });
    expect(closeRes.status).toBe(200);
    await workflow.waitUntilComplete(intentId, 20000);
  }, 20000);

  test("POST /api/runs/:wid/gates/:gateKey/reply sends a reply and records it", async () => {
    const intentId = generateId("it_gate_reply");
    await insertIntent(pool, intentId, { goal: "test gate reply", inputs: {}, constraints: {} });
    const { runId } = await startIntentRun(pool, workflow, intentId, {
      recipeName: "compile-default",
      queueName: "intentQ",
      queuePartitionKey: "test-partition"
    });

    // 1. Wait for gate
    let gate = null;
    for (let i = 0; i < 40; i++) {
      gate = await findLatestGateByRunId(pool, runId);
      if (gate) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const gateKey = gate!.gate_key;

    // 2. Call POST reply endpoint
    const dedupeKey = `dedupe-${intentId}`;
    const payload = { approved: true, note: "API test" };
    const res = await fetch(`${baseUrl}/runs/${intentId}/gates/${gateKey}/reply`, {
      method: "POST",
      body: JSON.stringify({ payload, dedupeKey }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(200);

    // 3. Verify interaction ledger
    const interactions = await pool.query(
      "SELECT count(*)::int AS c, min(run_id) AS run_id, min(origin) AS origin FROM app.human_interactions WHERE workflow_id = $1 AND dedupe_key = $2",
      [intentId, dedupeKey]
    );
    expect(interactions.rows[0].c).toBe(1);
    expect(interactions.rows[0].run_id).toBe(runId);
    expect(interactions.rows[0].origin).toBe("manual");

    // 4. Verify result event
    const resultKey = toHitlResultKey(gateKey);
    let result = null;
    for (let i = 0; i < 20; i++) {
      result = await workflow.getEvent(intentId, resultKey, 0);
      if (result) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(result).toMatchObject({ state: "RECEIVED", payload });
    await workflow.waitUntilComplete(intentId, 20000);
  }, 20000);

  test("separate-process shim proof: DBOSClient shim can send messages", async () => {
    const { getConfig } = await import("../../src/config");
    const cfg = getConfig();
    const shim = await DBOSClientWorkflowEngine.create(cfg.systemDatabaseUrl, pool);

    const intentId = generateId("it_shim_proof");
    await insertIntent(pool, intentId, { goal: "test shim proof", inputs: {}, constraints: {} });
    const { runId } = await startIntentRun(pool, workflow, intentId, {
      recipeName: "compile-default",
      queueName: "intentQ",
      queuePartitionKey: "test-partition"
    });

    // 1. Wait for gate
    let gate = null;
    for (let i = 0; i < 40; i++) {
      gate = await findLatestGateByRunId(pool, runId);
      if (gate) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const gateKey = gate!.gate_key;
    const topic = gate!.topic;

    // 2. Send message via shim
    const dedupeKey = `shim-dedupe-${intentId}`;
    const payload = { approved: true, via: "shim" };
    await shim.sendMessage(intentId, payload, topic, dedupeKey);

    // 3. Verify interaction ledger (recorded by shim!)
    const interactions = await pool.query(
      "SELECT count(*)::int AS c, min(origin) AS origin FROM app.human_interactions WHERE workflow_id = $1 AND dedupe_key = $2",
      [intentId, dedupeKey]
    );
    expect(interactions.rows[0].c).toBe(1);
    expect(interactions.rows[0].origin).toBe("api-shim");

    // 4. Verify result event in main workflow
    const resultKey = toHitlResultKey(gateKey);
    let result = null;
    for (let i = 0; i < 20; i++) {
      result = await workflow.getEvent(intentId, resultKey, 0);
      if (result) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(result).toMatchObject({ state: "RECEIVED", payload });
    await workflow.waitUntilComplete(intentId, 20000);

    await shim.destroy();
  }, 20000);

  test("Fail-closed: POST /reply rejects missing dedupeKey", async () => {
    const res = await fetch(`${baseUrl}/runs/any/gates/any/reply`, {
      method: "POST",
      body: JSON.stringify({ payload: {} }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("must have required property 'dedupeKey'");
  });

  test("Fail-closed: GET /gate rejects invalid timeoutS query", async () => {
    const res1 = await fetch(`${baseUrl}/runs/wf/gates/g1?timeoutS=abc`);
    expect(res1.status).toBe(400);
    const res2 = await fetch(`${baseUrl}/runs/wf/gates/g1?timeoutS=99`);
    expect(res2.status).toBe(400);
  });

  test("GET /gate long-poll wakes up when result is emitted", async () => {
    const intentId = generateId("it_gate_longpoll");
    await insertIntent(pool, intentId, {
      goal: "test gate long-poll",
      inputs: {},
      constraints: {}
    });
    const { runId } = await startIntentRun(pool, workflow, intentId, {
      recipeName: "compile-default",
      queueName: "intentQ",
      queuePartitionKey: "test-partition"
    });

    let gate = null;
    for (let i = 0; i < 40; i++) {
      gate = await findLatestGateByRunId(pool, runId);
      if (gate) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(gate).not.toBeNull();
    const gateKey = gate!.gate_key;

    const pendingFetch = fetch(`${baseUrl}/runs/${intentId}/gates/${gateKey}?timeoutS=3`);
    setTimeout(() => {
      void fetch(`${baseUrl}/runs/${intentId}/gates/${gateKey}/reply`, {
        method: "POST",
        body: JSON.stringify({
          payload: { choice: "yes", rationale: "long-poll" },
          dedupeKey: `longpoll-${intentId}`
        }),
        headers: { "content-type": "application/json" }
      });
    }, 300);

    const res = await pendingFetch;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("RECEIVED");
    await workflow.waitUntilComplete(intentId, 20000);
  }, 20000);
});
