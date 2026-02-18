import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { insertIntent } from "../../src/db/intentRepo";
import { insertRun } from "../../src/db/runRepo";
import { findOpencodeCallsByRunId } from "../../src/db/opencodeCallRepo";
import { generateId } from "../../src/lib/id";
import { OCWrapper } from "../../src/oc/wrapper";
import { getConfig } from "../../src/config";

describe("OC Wrapper Replay Proof", () => {
  let pool: Pool;

  beforeAll(() => {
    process.env.OC_MODE = "replay";
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  it("reconstructs prompt, schema, and output from DB rows", async () => {
    const intentId = generateId("it_replay");
    const runId = generateId("run_replay");
    await insertIntent(pool, intentId, { goal: "replay proof", inputs: {}, constraints: {} });
    await insertRun(pool, {
      id: runId,
      intent_id: intentId,
      workflow_id: intentId,
      status: "queued"
    });

    const wrapper = new OCWrapper(getConfig());
    const sessionId = await wrapper.createSession(runId, runId);
    await wrapper.promptStructured(
      sessionId,
      "Goal: replay proof",
      {},
      {
        agent: "build",
        runId,
        stepId: "DecideST",
        attempt: 1,
        producer: async () => ({
          prompt: "Goal: replay proof",
          toolcalls: [],
          responses: [],
          diffs: [],
          structured: {
            patch: [],
            tests: ["t"],
            test_command: "ls"
          }
        })
      }
    );

    const calls = await findOpencodeCallsByRunId(pool, runId);
    const decideCall = calls.find((c) => c.step_id === "DecideST");
    expect(decideCall).toBeDefined();
    expect(decideCall?.op_key).toBeDefined();
    expect(decideCall?.request).toBeDefined();
    expect(decideCall?.response).toBeDefined();
    expect(decideCall?.prompt).toContain("Goal: replay proof");
  });
});
