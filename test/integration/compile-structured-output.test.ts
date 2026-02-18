import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { OCMockDaemon } from "../oc-mock-daemon";
import { OCWrapper } from "../../src/oc/wrapper";
import { getConfig } from "../../src/config";
import { createPool, closePool } from "../../src/db/pool";
import type { Pool } from "pg";
import { generateId } from "../../src/lib/id";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { CompileStepImpl } from "../../src/workflow/steps/compile.step";
import { setRngSeed } from "../../src/lib/rng";

describe("Compile Structured Output Integration", () => {
  let daemon: OCMockDaemon;
  const daemonPort = 4102;
  const ocUrl = `http://127.0.0.1:${daemonPort}`;
  let pool: Pool;
  let workflow: DBOSWorkflowEngine;

  beforeAll(async () => {
    await DBOS.launch();
    pool = createPool();
    workflow = new DBOSWorkflowEngine(20);
    daemon = new OCMockDaemon(daemonPort);
    await daemon.start();
    process.env.OC_MODE = "live";
    process.env.OC_BASE_URL = ocUrl;
  });

  beforeEach(() => {
    setRngSeed(Date.now() + Math.floor(Math.random() * 1000000));
  });

  afterAll(async () => {
    await daemon.stop();
    await DBOS.shutdown();
    await pool.end();
    await closePool();
  });

  async function createTestRun(goal: string) {
    const intentId = generateId("it_str_" + Date.now());
    await insertIntent(pool, intentId, { goal, inputs: {}, constraints: {} });
    const { runId } = await startIntentRun(pool, workflow, intentId, {});
    return runId;
  }

  it("should return structured output from compiler", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    const compileStep = new CompileStepImpl(wrapper.port());

    const goal = "test goal";
    const runId = await createTestRun(goal);
    const intent = { goal, inputs: {}, constraints: {} };

    const mockOutput = {
      goal,
      design: [`Design for: ${goal}`],
      files: [],
      risks: [],
      tests: []
    };

    daemon.setNextResponse({
      info: {
        id: "msg-1",
        structured_output: mockOutput
      }
    });

    const result = await compileStep.execute(intent, { runId, attempt: 1 });
    expect(result).toEqual(mockOutput);
  });

  it("should return fallback structured output if daemon response is missing it", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    const compileStep = new CompileStepImpl(wrapper.port());

    const goal = "test goal 2";
    const runId = await createTestRun(goal);
    const intent = { goal, inputs: {}, constraints: {} };

    daemon.setNextResponse({
      info: {
        id: "msg-1"
        // missing structured_output -> should trigger producer fallback
      }
    });

    const result = await compileStep.execute(intent, { runId, attempt: 1 });
    expect(result).toEqual({
      goal,
      design: [`Design for: ${goal}`],
      files: [],
      risks: [],
      tests: []
    });
  });
});
