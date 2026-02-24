import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { canonicalStringify } from "../../src/lib/hash";

describe("recipe import/export API routes", () => {
  let pool: Pool;
  let stop: (() => Promise<void>) | undefined;
  const port = 3005;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  beforeAll(async () => {
    await DBOS.launch();
    pool = createPool();
    await pool.query("TRUNCATE app.recipes, app.recipe_versions CASCADE");
    const workflow = new DBOSWorkflowEngine(25);
    const app = await startApp(pool, workflow, port);
    stop = async () => {
      await new Promise<void>((resolve) => app.server.close(() => resolve()));
      await DBOS.shutdown();
    };
  });

  afterAll(async () => {
    if (stop) await stop();
    await pool.end();
  });

  test("import then export returns canonical bundle", async () => {
    const id = `rcp_api_${Date.now()}`;
    const bundle = {
      id,
      versions: [
        {
          id,
          v: "1.0.0",
          name: "Recipe API",
          tags: ["api"],
          formSchema: { type: "object", additionalProperties: false, properties: {} },
          intentTmpl: { goal: "api" },
          wfEntry: "Runner.runIntent",
          queue: "intentQ",
          limits: { maxSteps: 10, maxFanout: 5, maxSbxMin: 2, maxTokens: 1000 },
          eval: [{ id: "exists", kind: "file_exists", glob: "artifacts/*.json" }],
          fixtures: [{ id: "fx1", formData: { x: 1 } }],
          prompts: { compile: "compile", postmortem: "postmortem" }
        }
      ]
    };

    const importRes = await fetch(`${baseUrl}/recipes/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle)
    });
    expect(importRes.status).toBe(201);

    const exportRes = await fetch(`${baseUrl}/recipes/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id })
    });
    expect(exportRes.status).toBe(200);
    const exported = await exportRes.json();
    expect(canonicalStringify(exported)).toBe(canonicalStringify(bundle));
  });

  test("list recipe overviews returns new recipe", async () => {
    const id = `rcp_list_${Date.now()}`;
    const bundle = {
      id,
      versions: [
        {
          id,
          v: "1.1.0",
          name: "List Recipe",
          formSchema: {},
          intentTmpl: {},
          wfEntry: "Runner.run",
          queue: "intentQ",
          limits: { maxSteps: 1, maxFanout: 1, maxSbxMin: 1, maxTokens: 1 },
          eval: [],
          fixtures: [{ id: "f1", formData: {} }],
          prompts: { compile: "c", postmortem: "p" }
        }
      ]
    };
    await fetch(`${baseUrl}/recipes/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle)
    });

    const listRes = await fetch(`${baseUrl}/recipes`);
    expect(listRes.status).toBe(200);
    const overviews = await listRes.json();
    const item = overviews.find((o: any) => o.id === id);
    expect(item).toBeDefined();
    expect(item.name).toBe("List Recipe");
    expect(item.latestV).toBe("1.1.0");
    expect(item.status).toBe("draft");
  });

  test("list recipe versions returns all imported versions", async () => {
    const id = `rcp_versions_${Date.now()}`;
    const bundle = {
      id,
      versions: [
        {
          id,
          v: "1.0.0",
          name: "V1",
          formSchema: {},
          intentTmpl: {},
          wfEntry: "R",
          queue: "intentQ",
          limits: { maxSteps: 1, maxFanout: 1, maxSbxMin: 1, maxTokens: 1 },
          eval: [],
          fixtures: [{ id: "f1", formData: {} }],
          prompts: { compile: "c", postmortem: "p" }
        },
        {
          id,
          v: "2.0.0",
          name: "V2",
          formSchema: {},
          intentTmpl: {},
          wfEntry: "R",
          queue: "intentQ",
          limits: { maxSteps: 1, maxFanout: 1, maxSbxMin: 1, maxTokens: 1 },
          eval: [{ id: "e1", kind: "file_exists", glob: "*" }],
          fixtures: [{ id: "f1", formData: {} }],
          prompts: { compile: "c", postmortem: "p" }
        }
      ]
    };
    await fetch(`${baseUrl}/recipes/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle)
    });

    const res = await fetch(`${baseUrl}/recipes/${id}/versions`);
    expect(res.status).toBe(200);
    const versions = await res.json();
    expect(versions).toHaveLength(2);
    expect(versions[0].v).toBe("2.0.0");
    expect(versions[0].evalCount).toBe(1);
    expect(versions[1].v).toBe("1.0.0");
    expect(versions[1].evalCount).toBe(0);
  });

  test("import rejects unknown keys fail-closed", async () => {
    const res = await fetch(`${baseUrl}/recipes/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "x", versions: [], unknown: true })
    });
    expect(res.status).toBe(400);
  });
});
