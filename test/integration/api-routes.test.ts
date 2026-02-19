import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertArtifact } from "../../src/db/artifactRepo";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  const workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
});

describe("API Routes (Cycle C2)", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}/api`;

  test("POST /api/intents creates an intent", async () => {
    const res = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({ goal: "test intent", inputs: {}, constraints: {} }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(201);
    const { intentId } = await res.json();
    expect(intentId).toMatch(/^it_/);
  });

  test("POST /api/runs starts a run and returns RunHeader", async () => {
    // 1. Create intent
    const intentRes = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({ goal: "test run", inputs: {}, constraints: {} }),
      headers: { "content-type": "application/json" }
    });
    const { intentId } = await intentRes.json();

    // 2. Start run
    const runRes = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      body: JSON.stringify({ intentId }),
      headers: { "content-type": "application/json" }
    });
    expect(runRes.status).toBe(202);
    const header = await runRes.json();
    expect(header.workflowID).toBe(intentId);
    expect(header.status).toBeDefined();
  });

  test("GET /api/runs/:wid returns RunHeader", async () => {
    const intentId = `it-test-${Date.now()}`;
    await pool.query("INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3)", [intentId, "test", {}]);
    await pool.query("INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4)", ["run-1-" + Date.now(), intentId, intentId, "running"]);

    const res = await fetch(`${baseUrl}/runs/${intentId}`);
    expect(res.status).toBe(200);
    const header = await res.json();
    expect(header.workflowID).toBe(intentId);
    expect(header.status).toBe("PENDING");
  });

  test("GET /api/runs/:wid/steps returns StepRow[]", async () => {
     const intentId = `it-steps-${Date.now()}`;
     const runId = `run-steps-${Date.now()}`;
     await pool.query("INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3)", [intentId, "test", {}]);
     await pool.query("INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4)", [runId, intentId, intentId, "running"]);
     await pool.query("INSERT INTO app.run_steps (run_id, step_id, attempt, phase, started_at) VALUES ($1, $2, $3, $4, NOW())", [runId, "Step1", 1, "CompileST"]);

     const res = await fetch(`${baseUrl}/runs/${intentId}/steps`);
     expect(res.status).toBe(200);
     const steps = await res.json();
     expect(steps).toBeInstanceOf(Array);
     expect(steps.length).toBe(1);
     expect(steps[0].stepID).toBe("Step1");
  });

  test("GET /api/artifacts/:id returns artifact content", async () => {
     const intentId = `it-art-${Date.now()}`;
     const runId = `run-art-${Date.now()}`;
     await pool.query("INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3)", [intentId, "test", {}]);
     await pool.query("INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4)", [runId, intentId, intentId, "running"]);

     const uri = `artifact://test/${Date.now()}`;
     await insertArtifact(pool, runId, "step-1", 0, {
         kind: "json",
         uri: uri,
         inline: { hello: "world" },
         sha256: "fake-sha"
     });

     const res = await fetch(`${baseUrl}/artifacts/${encodeURIComponent(uri)}`);
     expect(res.status).toBe(200);
     expect(res.headers.get("content-type")).toBe("application/json");
     const content = await res.json();
     expect(content).toEqual({ hello: "world" });
  });

  describe("Fail-closed security", () => {
    test("POST /api/intents rejects invalid schema", async () => {
      const res = await fetch(`${baseUrl}/intents`, {
        method: "POST",
        body: JSON.stringify({ goal: "" }), // goal is too short or empty
        headers: { "content-type": "application/json" }
      });
      expect(res.status).toBe(400);
    });

    test("POST /api/runs rejects invalid schema (unknown field)", async () => {
      const res = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        body: JSON.stringify({ intentId: "it_123", unknownField: "fail" }),
        headers: { "content-type": "application/json" }
      });
      expect(res.status).toBe(400);
    });

    test("POST /api/runs returns 404 for missing intent", async () => {
      const res = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        body: JSON.stringify({ intentId: "it_missing" }),
        headers: { "content-type": "application/json" }
      });
      expect(res.status).toBe(404);
    });

    test("POST /api/intents rejects invalid JSON", async () => {
      const res = await fetch(`${baseUrl}/intents`, {
        method: "POST",
        body: "{ invalid json }",
        headers: { "content-type": "application/json" }
      });
      expect(res.status).toBe(400);
    });
  });
});
