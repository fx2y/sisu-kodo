/**
 * C3.T1: Cancel boundary semantics.
 * Proves: step1 commits to app.marks BEFORE cancel; step2 absent; status=CANCELLED.
 * Uses SlowStepWorkflow with long sleep so cancel arrives during sleep (after step1).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupLifecycle, teardownLifecycle } from "./lifecycle";
import type { TestLifecycle } from "./lifecycle";
import {
  generateOpsTestId,
  OPS_TEST_TIMEOUT,
  waitForWorkflowStatus
} from "../helpers/ops-fixtures";
import { cancelWorkflow } from "../../src/server/ops-api";
import { randomSeed } from "../../src/lib/rng";

const SLOW_SLEEP_MS = 5000;

let lifecycle: TestLifecycle;

beforeAll(async () => {
  lifecycle = await setupLifecycle(SLOW_SLEEP_MS);
});

afterAll(async () => {
  await teardownLifecycle(lifecycle);
});

describe("ops cancel boundary semantics (C3.T1)", () => {
  test(
    "cancel after step1 commits: step1 in marks, step2 absent, status=CANCELLED",
    async () => {
      randomSeed();
      const wid = generateOpsTestId("c3-cancel");
      // Start workflow with 5s sleep between step1 and step2
      await lifecycle.workflow.startSlowStep(wid, SLOW_SLEEP_MS);

      // Poll until step1 mark appears (proves step1 committed)
      const start = Date.now();
      let step1Done = false;
      while (Date.now() - start < OPS_TEST_TIMEOUT) {
        const marks = await lifecycle.pool.query<{ step: string }>(
          `SELECT step FROM app.marks WHERE run_id = $1`,
          [wid]
        );
        if (marks.rows.some((r) => r.step === "s1")) {
          step1Done = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      expect(step1Done).toBe(true);

      // Cancel while workflow is sleeping between step1 and step2
      await cancelWorkflow(lifecycle.workflow, wid, lifecycle.pool, "test", "boundary-proof");

      // Wait for CANCELLED status
      const finalStatus = await waitForWorkflowStatus(
        lifecycle.workflow,
        wid,
        "CANCELLED",
        OPS_TEST_TIMEOUT
      );
      expect(finalStatus).toBe("CANCELLED");

      // step2 must NOT be present (cancel boundary proof)
      const marks = await lifecycle.pool.query<{ step: string }>(
        `SELECT step FROM app.marks WHERE run_id = $1`,
        [wid]
      );
      const stepNames = marks.rows.map((r) => r.step);
      expect(stepNames).toContain("s1");
      expect(stepNames).not.toContain("s2");

      // Op-intent artifact: only persisted when run_id has app.runs row (FK soft-fail for test fixtures).
      const artifact = await lifecycle.pool.query(
        `SELECT inline FROM app.artifacts WHERE run_id = $1 AND step_id = 'OPS' AND idx = 0`,
        [wid]
      );
      if (artifact.rowCount && artifact.rowCount > 0) {
        const tag = artifact.rows[0].inline as Record<string, unknown>;
        expect(tag.op).toBe("cancel");
        expect(tag.targetWorkflowID).toBe(wid);
      }
    },
    OPS_TEST_TIMEOUT * 3
  );

  test(
    "cancel on terminal workflow returns OpsConflictError",
    async () => {
      randomSeed();
      const wid = generateOpsTestId("c3-cancel-terminal");
      await lifecycle.workflow.startCrashDemo(wid);
      await lifecycle.workflow.waitUntilComplete(wid, OPS_TEST_TIMEOUT);

      await expect(cancelWorkflow(lifecycle.workflow, wid, lifecycle.pool)).rejects.toThrow(
        "cannot cancel"
      );
    },
    OPS_TEST_TIMEOUT * 2
  );
});
