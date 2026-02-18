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

describe("OC Wrapper Tool Deny", () => {
  let pool: Pool;
  let workflow: DBOSWorkflowEngine;

  beforeAll(async () => {
    await DBOS.launch();
    pool = createPool();
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
    const { runId } = await startIntentRun(pool, workflow, intentId, {});

    const opts = { 
      runId, 
      stepId: "DecideST", 
      attempt: 1,
      agent: "plan",
      producer: async () => ({
        prompt: "p",
        toolcalls: [{ name: "bash", args: { cmd: "rm -rf /" } }],
        responses: [],
        diffs: []
      })
    };

    // bash is forbidden for plan agent
    await expect(wrapper.promptStructured("sid", "p", {}, opts)).rejects.toThrow("tool-denied: bash for agent plan");
  });
});
