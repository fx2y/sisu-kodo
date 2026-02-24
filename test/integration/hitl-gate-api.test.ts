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

async function uniqueIntentId(prefix: string): Promise<string> {
  const res = await pool.query<{ id: string }>("SELECT gen_random_uuid()::text AS id");
  return `${prefix}_${res.rows[0].id.replace(/-/g, "")}`;
}

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    try {
      for (const status of ["PENDING", "ENQUEUED"] as const) {
        const active = await workflow.listWorkflows({ status, limit: 100 });
        await Promise.allSettled(active.map((wf) => workflow.cancelWorkflow(wf.workflowID)));
      }
    } catch (e) {
      console.error("[HITL-GATE-API-CLEANUP] Failed to cancel workflows:", e);
    }
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
}, 120000);

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
    expect(view.topic).toBe(gate!.topic);
    expect(typeof view.createdAt).toBe("number");
    expect(view.state).toBe("PENDING");
    expect(view.prompt).toBeDefined();
    expect(view.prompt.formSchema).toBeDefined();

    // Complete the workflow to avoid leaking a waiting gate into global teardown.
    const closeRes = await fetch(`${baseUrl}/runs/${intentId}/gates/${gateKey}/reply`, {
      method: "POST",
      body: JSON.stringify({
        payload: { choice: "yes", rationale: "gate-get-cleanup" },
        dedupeKey: `gate-get-cleanup-${intentId}`,
        origin: "manual"
      }),
      headers: { "content-type": "application/json" }
    });
    expect(closeRes.status).toBe(200);
    await workflow.waitUntilComplete(intentId, 20000);
  }, 20000);

  test("POST /api/runs/:wid/gates/:gateKey/reply sends a reply and records it", async () => {
    const intentId = await uniqueIntentId("it_gate_reply");
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
      body: JSON.stringify({ payload, dedupeKey, origin: "manual" }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(200);
    const firstBody = (await res.json()) as { ok: boolean; isReplay: boolean };
    expect(firstBody.ok).toBe(true);
    expect(firstBody.isReplay).toBe(false);

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
      body: JSON.stringify({ payload: {}, origin: "manual" }),
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
          dedupeKey: `longpoll-${intentId}`,
          origin: "manual"
        }),
        headers: { "content-type": "application/json" }
      });
    }, 300);

    const res = await pendingFetch;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(["RECEIVED", "RESOLVED"]).toContain(body.state);
    await workflow.waitUntilComplete(intentId, 20000);
  }, 20000);

  test("GET /api/runs/:wid/interactions returns merged manual/external timeline", async () => {
    const intentId = generateId("it_gate_interactions");
    await insertIntent(pool, intentId, {
      goal: "test interactions timeline",
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

    const topic = gate!.topic;
    await workflow.sendMessage(intentId, { approved: true }, topic, `itx-manual-${intentId}`);
    await workflow.waitUntilComplete(intentId, 20_000);

    const res = await fetch(`${baseUrl}/runs/${intentId}/interactions?limit=50`);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ topic: string; dedupeKey: string; origin: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.topic === topic)).toBe(true);
    expect(rows.some((row) => row.dedupeKey === `itx-manual-${intentId}`)).toBe(true);
    expect(rows.some((row) => typeof row.origin === "string" && row.origin.length > 0)).toBe(true);
  }, 20000);

  test("GET /api/hitl/inbox enforces bounded limit and deterministic ordering", async () => {
    const runAIntent = generateId("it_hitl_inbox_a");
    await insertIntent(pool, runAIntent, { goal: "inbox-a", inputs: {}, constraints: {} });
    const { runId: runAId } = await startIntentRun(pool, workflow, runAIntent, {
      recipeName: "compile-default",
      queueName: "intentQ",
      queuePartitionKey: "test-partition"
    });

    const runBIntent = generateId("it_hitl_inbox_b");
    await insertIntent(pool, runBIntent, { goal: "inbox-b", inputs: {}, constraints: {} });
    const { runId: runBId } = await startIntentRun(pool, workflow, runBIntent, {
      recipeName: "compile-default",
      queueName: "intentQ",
      queuePartitionKey: "test-partition"
    });

    const bad = await fetch(`${baseUrl}/hitl/inbox?limit=9999`);
    expect(bad.status).toBe(400);

    const res = await fetch(`${baseUrl}/hitl/inbox?limit=2`);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ workflowID: string; createdAt: number }>;
    expect(rows.length).toBeLessThanOrEqual(2);
    const sorted = [...rows].sort(
      (a, b) => a.createdAt - b.createdAt || a.workflowID.localeCompare(b.workflowID)
    );
    expect(rows.map((row) => row.workflowID)).toEqual(sorted.map((row) => row.workflowID));

    let gateA = null;
    let gateB = null;
    for (let i = 0; i < 40; i++) {
      gateA = await findLatestGateByRunId(pool, runAId);
      gateB = await findLatestGateByRunId(pool, runBId);
      if (gateA && gateB) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(gateA).not.toBeNull();
    expect(gateB).not.toBeNull();
    await workflow.sendMessage(
      runAIntent,
      { choice: "yes" },
      gateA!.topic,
      `cleanup-${runAIntent}`
    );
    await workflow.sendMessage(
      runBIntent,
      { choice: "yes" },
      gateB!.topic,
      `cleanup-${runBIntent}`
    );
    await workflow.waitUntilComplete(runAIntent, 20_000);
    await workflow.waitUntilComplete(runBIntent, 20_000);
  }, 20000);
});
