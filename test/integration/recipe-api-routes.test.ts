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
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}/api`;

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

  test("import rejects unknown keys fail-closed", async () => {
    const res = await fetch(`${baseUrl}/recipes/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "x", versions: [], unknown: true })
    });
    expect(res.status).toBe(400);
  });
});
