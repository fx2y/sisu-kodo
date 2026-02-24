import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OCWrapper } from "../../src/oc/wrapper";
import { getConfig } from "../../src/config";
import { createPool, closePool } from "../../src/db/pool";
import type { Pool } from "pg";
import { generateId } from "../../src/lib/id";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { listRecipeOverviews } from "../../src/db/recipeRepo";

describe("OC Wrapper Tool Deny", () => {
  let pool: Pool;
  let workflow: DBOSWorkflowEngine;

  beforeAll(async () => {
    await DBOS.launch();
    pool = createPool();
    const recipes = await listRecipeOverviews(pool);
    console.log("[DEBUG] app.recipes count:", recipes.length);
    if (recipes.length === 0) {
      console.log("[DEBUG] app.recipes is empty! migrations failed to seed?");
    } else {
      console.log("[DEBUG] recipes:", JSON.stringify(recipes.map((r) => r.name)));
    }
    workflow = new DBOSWorkflowEngine(20);
    process.env.OC_MODE = "live";
  });

  afterAll(async () => {
    await DBOS.shutdown();
    await pool.end();
    await closePool();
  });

  it("should fail deterministically if a forbidden tool is returned", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    const intentId = generateId("it_deny");
    await insertIntent(pool, intentId, { goal: "deny test", inputs: {}, constraints: {} });
    const { runId } = await startIntentRun(pool, workflow, intentId, {
      queuePartitionKey: "test-partition"
    });

    await expect(
      wrapper.run({
        intent: "deny test",
        schemaVersion: 1,
        seed: runId,
        mode: "live",
        agent: "plan",
        producer: async () => ({
          prompt: "p",
          toolcalls: [{ name: "bash", args: { cmd: "rm -rf /" } }],
          responses: [],
          diffs: []
        })
      })
    ).rejects.toThrow("tool-denied: bash for agent plan");
  });
});
