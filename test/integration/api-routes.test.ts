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

  async function seedStableRecipe(id: string, v: string): Promise<void> {
    await seedStableRecipeVersion(id, v, {
      maxSteps: 10,
      maxFanout: 1,
      maxSbxMin: 5,
      maxTokens: 1024
    });
    await seedRecipePointer(id, v, {
      version: 1,
      queueName: "intentQ",
      maxConcurrency: 10,
      maxSteps: 32,
      maxSandboxMinutes: 15
    });
  }

  async function seedStableRecipeVersion(
    id: string,
    v: string,
    limits: { maxSteps: number; maxFanout: number; maxSbxMin: number; maxTokens: number }
  ): Promise<void> {
    const spec = {
      id,
      v,
      name: `${id} recipe`,
      tags: ["test"],
      formSchema: {
        type: "object",
        properties: {
          goal: { type: "string", default: "hello goal" },
          accountId: { type: "string", default: "acct-1" }
        },
        required: []
      },
      intentTmpl: {
        goal: "{{formData.goal}}",
        inputs: { accountId: "{{formData.accountId}}" },
        constraints: {}
      },
      wfEntry: "Runner.runIntent",
      queue: "intentQ",
      limits,
      eval: [],
      fixtures: [],
      prompts: { compile: "x", postmortem: "y" }
    };
    await pool.query(
      `INSERT INTO app.recipe_versions (id, v, hash, status, json)
      VALUES ($1, $2, md5($3), 'stable', $4::jsonb)
       ON CONFLICT (id, v) DO NOTHING`,
      [id, v, JSON.stringify(spec), JSON.stringify(spec)]
    );
  }

  async function seedRecipePointer(
    id: string,
    activeV: string,
    opts: {
      version: number;
      queueName: "compileQ" | "sbxQ" | "controlQ" | "intentQ";
      maxConcurrency: number;
      maxSteps: number;
      maxSandboxMinutes: number;
    }
  ): Promise<void> {
    await pool.query(
      `INSERT INTO app.recipes (id, name, version, queue_name, max_concurrency, max_steps, max_sandbox_minutes, spec, active_v)
       VALUES ($1, $1, $2, $3, $4, $5, $6, '{}'::jsonb, $7)
       ON CONFLICT (id) DO UPDATE SET
         version = EXCLUDED.version,
         queue_name = EXCLUDED.queue_name,
         max_concurrency = EXCLUDED.max_concurrency,
         max_steps = EXCLUDED.max_steps,
         max_sandbox_minutes = EXCLUDED.max_sandbox_minutes,
         active_v = EXCLUDED.active_v`,
      [
        id,
        opts.version,
        opts.queueName,
        opts.maxConcurrency,
        opts.maxSteps,
        opts.maxSandboxMinutes,
        activeV
      ]
    );
  }

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
      body: JSON.stringify({ intentId, queuePartitionKey: "test-partition" }),
      headers: { "content-type": "application/json" }
    });
    expect(runRes.status).toBe(202);
    const header = await runRes.json();
    expect(header.workflowID).toBe(intentId);
    expect(header.status).toBeDefined();
  });

  test("POST /api/run compiles recipe form to hash-idempotent workflow", async () => {
    await seedStableRecipe("cy2-test", "v1");
    const payload = {
      recipeRef: { id: "cy2-test", v: "v1" },
      formData: { goal: "same-goal", accountId: "acct-z" },
      opts: { queuePartitionKey: "p-cy2" }
    };

    const first = await fetch(`${baseUrl}/run`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" }
    });
    expect(first.status).toBe(202);
    const headerA = await first.json();
    expect(headerA.workflowID).toMatch(/^ih_[a-f0-9]{64}$/);
    expect(headerA.intentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(headerA.recipeRef).toEqual({ id: "cy2-test", v: "v1" });

    const second = await fetch(`${baseUrl}/run`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" }
    });
    expect(second.status).toBe(202);
    const headerB = await second.json();
    expect(headerB.workflowID).toBe(headerA.workflowID);

    const rows = await pool.query(
      "SELECT COUNT(*)::int AS n FROM app.runs WHERE workflow_id = $1",
      [headerA.workflowID]
    );
    expect(rows.rows[0].n).toBe(1);

    const intentRow = await pool.query(
      `SELECT id, intent_hash, recipe_id, recipe_v, recipe_hash, json
         FROM app.intents WHERE id = $1`,
      [headerA.workflowID]
    );
    expect(intentRow.rowCount).toBe(1);
    expect(intentRow.rows[0].intent_hash).toBe(headerA.intentHash);
    expect(intentRow.rows[0].recipe_id).toBe("cy2-test");
    expect(intentRow.rows[0].recipe_v).toBe("v1");
    expect(intentRow.rows[0].recipe_hash).toBe(headerA.recipeHash);
    expect(intentRow.rows[0].json).toBeTruthy();

    const runRow = await pool.query(
      `SELECT intent_hash, recipe_id, recipe_v, recipe_hash
         FROM app.runs WHERE workflow_id = $1`,
      [headerA.workflowID]
    );
    expect(runRow.rowCount).toBe(1);
    expect(runRow.rows[0].intent_hash).toBe(headerA.intentHash);
    expect(runRow.rows[0].recipe_id).toBe("cy2-test");
    expect(runRow.rows[0].recipe_v).toBe("v1");
    expect(runRow.rows[0].recipe_hash).toBe(headerA.recipeHash);

    const getHeader = await fetch(`${baseUrl}/runs/${headerA.workflowID}`);
    expect(getHeader.status).toBe(200);
    const projected = await getHeader.json();
    expect(projected.intentHash).toBe(headerA.intentHash);
    expect(projected.recipeRef).toEqual({ id: "cy2-test", v: "v1" });
    expect(projected.recipeHash).toBe(headerA.recipeHash);
  });

  test("POST /api/run returns 409 for duplicate identity drift", async () => {
    await seedStableRecipe("cy2-conflict", "v1");
    const payloadA = {
      recipeRef: { id: "cy2-conflict", v: "v1" },
      formData: { goal: "conflict-goal", accountId: "acct-conflict" },
      opts: {
        queuePartitionKey: "p-conflict",
        budget: {
          maxFanout: 1,
          maxSBXMinutes: 5,
          maxArtifactsMB: 1,
          maxRetriesPerStep: 0,
          maxWallClockMS: 5000
        }
      }
    };

    const first = await fetch(`${baseUrl}/run`, {
      method: "POST",
      body: JSON.stringify(payloadA),
      headers: { "content-type": "application/json" }
    });
    expect(first.status).toBe(202);

    const second = await fetch(`${baseUrl}/run`, {
      method: "POST",
      body: JSON.stringify({
        ...payloadA,
        opts: {
          ...payloadA.opts,
          budget: {
            ...payloadA.opts.budget,
            maxWallClockMS: 7000
          }
        }
      }),
      headers: { "content-type": "application/json" }
    });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(String(body.error ?? "")).toContain("Divergence in run");
  });

  test("POST /api/run enforces pinned recipeRef version for queue-policy caps", async () => {
    await seedStableRecipeVersion("cy2-versioned", "v1", {
      maxSteps: 10,
      maxFanout: 1,
      maxSbxMin: 5,
      maxTokens: 1024
    });
    await seedStableRecipeVersion("cy2-versioned", "v2", {
      maxSteps: 10,
      maxFanout: 10,
      maxSbxMin: 5,
      maxTokens: 1024
    });
    await seedRecipePointer("cy2-versioned", "v2", {
      version: 99,
      queueName: "intentQ",
      maxConcurrency: 99,
      maxSteps: 99,
      maxSandboxMinutes: 99
    });

    const res = await fetch(`${baseUrl}/run`, {
      method: "POST",
      body: JSON.stringify({
        recipeRef: { id: "cy2-versioned", v: "v1" },
        formData: { goal: "versioned-goal", accountId: "acct-versioned" },
        opts: {
          queuePartitionKey: "p-version",
          workload: {
            concurrency: 5,
            steps: 1,
            sandboxMinutes: 1
          }
        }
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error ?? "")).toContain("recipe cap exceeded: concurrency 5 > 1");
  });

  test("GET /api/runs/:wid returns RunHeader", async () => {
    const intentId = `it-test-${Date.now()}`;
    await pool.query("INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3)", [
      intentId,
      "test",
      {}
    ]);
    await pool.query(
      "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4)",
      ["run-1-" + Date.now(), intentId, intentId, "running"]
    );

    const res = await fetch(`${baseUrl}/runs/${intentId}`);
    expect(res.status).toBe(200);
    const header = await res.json();
    expect(header.workflowID).toBe(intentId);
    expect(header.status).toBe("PENDING");
  });

  test("GET /api/runs/:wid/steps returns StepRow[]", async () => {
    const intentId = `it-steps-${Date.now()}`;
    const runId = `run-steps-${Date.now()}`;
    await pool.query("INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3)", [
      intentId,
      "test",
      {}
    ]);
    await pool.query(
      "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4)",
      [runId, intentId, intentId, "running"]
    );
    await pool.query(
      "INSERT INTO app.run_steps (run_id, step_id, attempt, phase, started_at) VALUES ($1, $2, $3, $4, NOW())",
      [runId, "Step1", 1, "CompileST"]
    );

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
    await pool.query("INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3)", [
      intentId,
      "test",
      {}
    ]);
    await pool.query(
      "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4)",
      [runId, intentId, intentId, "running"]
    );

    const uri = `artifact://test/${Date.now()}`;
    await insertArtifact(pool, runId, "step-1", 0, {
      kind: "json",
      uri: uri,
      inline: { hello: "world" },
      sha256: "4876e85484e6f3f3a9ef74d844a010f310fbbce089567345523cb2f018d0015e"
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
