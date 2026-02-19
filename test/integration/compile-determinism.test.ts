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

describe("Compile Determinism Integration", () => {
  let daemon: OCMockDaemon;
  const daemonPort = 4103;
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

  let testIdx = 0;
  beforeEach(() => {
    setRngSeed(42 + testIdx++);
  });

  afterAll(async () => {
    await daemon.stop();
    await DBOS.shutdown();
    await pool.end();
    await closePool();
  });

  async function createTestRun(goal: string) {
    const intentId = generateId(`it_det_${testIdx}`);
    await insertIntent(pool, intentId, { goal, inputs: {}, constraints: {} });
    const { runId } = await startIntentRun(pool, workflow, intentId, {
      queuePartitionKey: "test-partition"
    });
    return runId;
  }

  it("should return cached output on retry of the same step", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    const compileStep = new CompileStepImpl(wrapper.port());

    const goal = "determinism goal";
    const runId = await createTestRun(goal);
    const intent = { goal, inputs: {}, constraints: {} };

    const mockOutput = {
      goal,
      plan: ["step 1"],
      patch: [],
      tests: ["test 1"]
    };

    daemon.setNextResponse({
      info: {
        id: "msg-1",
        structured_output: mockOutput
      }
    });

    const initialCalls = daemon.callCount;
    const result1 = await compileStep.execute(intent, { runId, attempt: 1 });
    // createSession, log, promptStructured = 3 calls
    expect(daemon.callCount).toBe(initialCalls + 3);

    // Same runId, same stepId, same attempt -> should be cached in OCWrapper
    const result2 = await compileStep.execute(intent, { runId, attempt: 1 });
    // createSession cached, promptStructured cached. log is NOT cached.
    // So 1 additional call to log.
    expect(daemon.callCount).toBe(initialCalls + 3 + 1);
    expect(result2).toEqual(result1);
  });
});
