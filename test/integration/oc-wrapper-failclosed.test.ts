import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { findRunSteps } from "../../src/db/runRepo";
import { generateId } from "../../src/lib/id";

import { OCClientFixtureAdapter } from "../../src/oc/client";
import type { OCOutput } from "../../src/oc/schema";

let pool: Pool;
let workflow: DBOSWorkflowEngine;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(20);
});

afterAll(async () => {
  await DBOS.shutdown();
  await pool.end();
  await closePool();
});

describe("oc-wrapper fail-closed behavior", () => {
  test("tool-denied failure does not persist step output", async () => {
    const intentId = generateId("it_fail");
    await insertIntent(pool, intentId, {
      goal: "trigger fail-closed",
      inputs: {},
      constraints: {}
    });

    // Mock the OC port to return a tool that is forbidden for plan agent
    // Since DecideST doesn't specify agent yet, it defaults to build.
    // I'll mock it to return something that fails OCOutput validation.
    const spy = vi.spyOn(OCClientFixtureAdapter.prototype, "run").mockImplementation(async () => {
      return {
        key: "bad",
        payload: {
          prompt: "p",
          toolcalls: [{ name: "forbidden_tool", args: {} }],
          responses: [],
          diffs: []
        } as OCOutput
      };
    });

    const { runId } = await startIntentRun(pool, workflow, intentId, {});
    try {
      await workflow.waitUntilComplete(intentId, 10000);
    } catch (_e) {
      // Expected to fail due to tool-denied error
    }

    const steps = await findRunSteps(pool, runId);
    const decideStep = steps.find((s) => s.stepId === "DecideST");
    expect(decideStep).toBeUndefined();

    const run = await pool.query("SELECT status, error FROM app.runs WHERE id = $1", [runId]);
    expect(run.rows[0].status).toBe("retries_exceeded");
    expect(run.rows[0].error).toContain("tool-denied: forbidden_tool");

    spy.mockRestore();
  });
});
