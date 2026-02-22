import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;
let workflow: DBOSWorkflowEngine;

async function uniqueToken(prefix: string): Promise<string> {
  const idRes = await pool.query<{ id: string }>("SELECT gen_random_uuid()::text AS id");
  return `${prefix}-${idRes.rows[0].id}`;
}

async function waitForGate(runId: string) {
  const { findLatestGateByRunId } = await import("../../src/db/humanGateRepo");
  for (let i = 0; i < 40; i += 1) {
    const gate = await findLatestGateByRunId(pool, runId);
    if (gate) return gate;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`gate not found for run ${runId}`);
}

async function seedRun(goal: string) {
  const { insertIntent } = await import("../../src/db/intentRepo");
  const { startIntentRun } = await import("../../src/workflow/start-intent");
  const idRes = await pool.query<{ id: string }>("SELECT gen_random_uuid()::text AS id");
  const intentId = `it_hitl_err_${idRes.rows[0].id}`;
  await insertIntent(pool, intentId, { goal, inputs: {}, constraints: {} });
  const { runId } = await startIntentRun(pool, workflow, intentId, {
    recipeName: "compile-default",
    queueName: "intentQ",
    queuePartitionKey: "test-partition"
  });
  return { intentId, runId };
}

async function resolveRun(intentId: string, runId: string, dedupeKey = `cleanup-${runId}`) {
  const gate = await waitForGate(runId);
  await workflow.sendMessage(
    intentId,
    { choice: "yes", rationale: "cleanup" },
    gate.topic,
    dedupeKey
  );
  await workflow.waitUntilComplete(intentId, 20_000);
}

beforeAll(async () => {
  process.env.DBOS__APPVERSION = `hitl-error-${process.pid}`;
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

describe("HITL Error Handling (GAP S0.02/S0.03)", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}/api`;

  test("POST /api/events/hitl returns 400 for malformed JSON", async () => {
    const res = await fetch(`${baseUrl}/events/hitl`, {
      method: "POST",
      body: "not a json",
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid json");
  });

  test("POST /api/events/hitl returns 400 for schema-invalid payload", async () => {
    const res = await fetch(`${baseUrl}/events/hitl`, {
      method: "POST",
      body: JSON.stringify({
        workflowId: "missing-other-fields"
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("invalid ExternalEvent");
  });

  test("POST /api/runs/:wid/gates/:gateKey/reply returns 404 for missing run", async () => {
    const dedupeKey = await uniqueToken("reply-missing-run");
    const res = await fetch(`${baseUrl}/runs/missing-run/gates/any-gate/reply`, {
      method: "POST",
      body: JSON.stringify({
        payload: { choice: "yes" },
        dedupeKey,
        origin: "manual"
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(404);
    const rows = await pool.query(
      "SELECT count(*)::int AS c FROM app.human_interactions WHERE workflow_id = $1 AND dedupe_key = $2",
      ["missing-run", dedupeKey]
    );
    expect(rows.rows[0].c).toBe(0);
  });

  test("POST /reply returns 404 for missing gate and does zero writes", async () => {
    const { intentId, runId } = await seedRun("test missing gate");
    const dedupeKey = await uniqueToken(`missing-gate-${intentId}`);
    const res = await fetch(`${baseUrl}/runs/${intentId}/gates/missing-gate/reply`, {
      method: "POST",
      body: JSON.stringify({
        payload: { choice: "yes" },
        dedupeKey,
        origin: "manual"
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(404);
    const rows = await pool.query(
      "SELECT count(*)::int AS c FROM app.human_interactions WHERE workflow_id = $1 AND dedupe_key = $2",
      [intentId, dedupeKey]
    );
    expect(rows.rows[0].c).toBe(0);
    await resolveRun(intentId, runId, `cleanup-missing-gate-${intentId}`);
  });

  test("POST /reply returns 400 for bad gateKey and does zero writes", async () => {
    const { intentId, runId } = await seedRun("test bad gate key");
    const dedupeKey = await uniqueToken(`bad-gate-${intentId}`);
    const res = await fetch(`${baseUrl}/runs/${intentId}/gates/BAD_KEY/reply`, {
      method: "POST",
      body: JSON.stringify({
        payload: { choice: "yes" },
        dedupeKey,
        origin: "manual"
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(400);
    const rows = await pool.query(
      "SELECT count(*)::int AS c FROM app.human_interactions WHERE workflow_id = $1 AND dedupe_key = $2",
      [intentId, dedupeKey]
    );
    expect(rows.rows[0].c).toBe(0);
    await resolveRun(intentId, runId, `cleanup-bad-gate-${intentId}`);
  });

  test("dedupe row does not blackhole retries when send fails once (GAP S0.01)", async () => {
    const { intentId, runId } = await seedRun("test transient send failure");
    const gate = await waitForGate(runId);
    const dedupeKey = `send-once-${intentId}`;
    const originalSend = workflow.sendMessage.bind(workflow);
    let injected = false;

    workflow.sendMessage = (async (...args: Parameters<typeof workflow.sendMessage>) => {
      if (!injected) {
        injected = true;
        throw new Error("injected send failure");
      }
      return await originalSend(...args);
    }) as DBOSWorkflowEngine["sendMessage"];

    try {
      const first = await fetch(`${baseUrl}/runs/${intentId}/gates/${gate.gate_key}/reply`, {
        method: "POST",
        body: JSON.stringify({
          payload: { choice: "yes", rationale: "retry" },
          dedupeKey,
          origin: "manual"
        }),
        headers: { "content-type": "application/json" }
      });
      expect(first.status).toBe(500);

      const second = await fetch(`${baseUrl}/runs/${intentId}/gates/${gate.gate_key}/reply`, {
        method: "POST",
        body: JSON.stringify({
          payload: { choice: "yes", rationale: "retry" },
          dedupeKey,
          origin: "manual"
        }),
        headers: { "content-type": "application/json" }
      });
      expect(second.status).toBe(200);
    } finally {
      workflow.sendMessage = originalSend;
    }

    const rows = await pool.query(
      "SELECT count(*)::int AS c FROM app.human_interactions WHERE workflow_id = $1 AND dedupe_key = $2",
      [intentId, dedupeKey]
    );
    expect(rows.rows[0].c).toBe(1);
    await workflow.waitUntilComplete(intentId, 20_000);
  });

  test("POST /reply returns 409 for dedupeKey conflict with different payload (GAP S1.07)", async () => {
    const { intentId, runId } = await seedRun("test dedupe conflict");
    const gate = await waitForGate(runId);
    const gateKey = gate.gate_key;
    const dedupeKey = `conflict-${intentId}`;

    // 2. First reply
    const res1 = await fetch(`${baseUrl}/runs/${intentId}/gates/${gateKey}/reply`, {
      method: "POST",
      body: JSON.stringify({
        payload: { choice: "yes" },
        dedupeKey,
        origin: "manual"
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res1.status).toBe(200);

    // 3. Second reply with SAME dedupeKey but DIFFERENT payload
    const res2 = await fetch(`${baseUrl}/runs/${intentId}/gates/${gateKey}/reply`, {
      method: "POST",
      body: JSON.stringify({
        payload: { choice: "no" }, // DIFFERENT
        dedupeKey,
        origin: "manual"
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res2.status).toBe(409);
    const data2 = await res2.json();
    expect(data2.error).toContain("dedupeKey conflict");
    await workflow.waitUntilComplete(intentId, 20_000);
  }, 20000);

  test("human_interactions payload_hash must be 64-hex (GAP S1.08)", async () => {
    await pool.query(`
      DELETE FROM app.human_interactions
       WHERE payload_hash !~ '^[a-f0-9]{64}$';

      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'payload_hash_format_check'
          ) THEN
              ALTER TABLE app.human_interactions
                ADD CONSTRAINT payload_hash_format_check
                CHECK (payload_hash ~ '^[a-f0-9]{64}$');
          END IF;
      END $$;
    `);
    await expect(
      pool.query(
        `INSERT INTO app.human_interactions
         (workflow_id, gate_key, topic, dedupe_key, payload_hash, payload, origin)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          "wf-hash-check",
          "run1:step:gate:a1",
          "human:run1:step:gate:a1",
          "hash-check-1",
          "not-a-hash",
          { choice: "yes" },
          "unknown"
        ]
      )
    ).rejects.toThrow();
  });
});
