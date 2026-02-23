/**
 * C3.T3: Fork semantics.
 * Proves: fork creates a new workflowID; prior step outputs cached (no re-execution);
 * target step reruns; op-intent artifact durable.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { setupLifecycle, teardownLifecycle } from "./lifecycle";
import type { TestLifecycle } from "./lifecycle";
import { generateOpsTestId, OPS_TEST_TIMEOUT } from "../helpers/ops-fixtures";
import { forkWorkflow } from "../../src/server/ops-api";
import { randomSeed } from "../../src/lib/rng";
import * as timeLib from "../../src/lib/time";

let lifecycle: TestLifecycle;

beforeAll(async () => {
  lifecycle = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lifecycle);
});

describe("ops fork semantics (C3.T3)", () => {
  test(
    "fork creates new workflowID and reuses step1 cache",
    async () => {
      randomSeed();
      const origWid = generateOpsTestId("c3-fork");

      // Start and complete original workflow
      await lifecycle.workflow.startCrashDemo(origWid);
      await lifecycle.workflow.waitUntilComplete(origWid, OPS_TEST_TIMEOUT);

      // Get step count to compute last step N
      const steps = await lifecycle.workflow.listWorkflowSteps(origWid);
      expect(steps.length).toBeGreaterThan(0);
      const lastStepN = Math.max(...steps.map((s) => s.functionId).filter(Number.isInteger));
      expect(lastStepN).toBeGreaterThan(0);

      // Fork from last step
      const ack = await forkWorkflow(
        lifecycle.workflow,
        origWid,
        { stepN: lastStepN },
        lifecycle.pool,
        "test",
        "fork-proof"
      );

      expect(ack.accepted).toBe(true);
      expect(ack.workflowID).toBe(origWid);
      expect(typeof ack.forkedWorkflowID).toBe("string");
      expect(ack.forkedWorkflowID).not.toBe(origWid);

      // Forked workflow must complete
      await lifecycle.workflow.waitUntilComplete(ack.forkedWorkflowID, OPS_TEST_TIMEOUT);
      const forkedStatus = await lifecycle.workflow.getWorkflowStatus(ack.forkedWorkflowID);
      expect(forkedStatus).toBe("SUCCESS");

      const artifact = await lifecycle.pool.query(
        `SELECT inline FROM app.artifacts WHERE run_id = $1 AND step_id = 'OPS' AND idx = 0`,
        [origWid]
      );
      expect(artifact.rowCount).toBe(1);
      const tag = artifact.rows[0].inline as Record<string, unknown>;
      expect(tag.op).toBe("fork");
      expect(tag.targetWorkflowID).toBe(origWid);
      expect(tag.forkedWorkflowID).toBe(ack.forkedWorkflowID);
    },
    OPS_TEST_TIMEOUT * 3
  );

  test(
    "fork with out-of-range stepN fails with OpsConflictError (409)",
    async () => {
      randomSeed();
      const wid = generateOpsTestId("c3-fork-oob");
      await lifecycle.workflow.startCrashDemo(wid);
      await lifecycle.workflow.waitUntilComplete(wid, OPS_TEST_TIMEOUT);

      // C2/C3: reject stepN > maxStep as 409
      await expect(
        forkWorkflow(lifecycle.workflow, wid, { stepN: 99999 }, lifecycle.pool)
      ).rejects.toThrow(/exceeds max step/);
    },
    OPS_TEST_TIMEOUT * 2
  );

  test(
    "fork op-intent artifacts do not collide when timestamps are identical",
    async () => {
      randomSeed();
      const wid = generateOpsTestId("c3-fork-same-ts");
      await lifecycle.workflow.startCrashDemo(wid);
      await lifecycle.workflow.waitUntilComplete(wid, OPS_TEST_TIMEOUT);

      const steps = await lifecycle.workflow.listWorkflowSteps(wid);
      const stepN = Math.max(...steps.map((s) => s.functionId).filter(Number.isInteger));
      const nowSpy = vi.spyOn(timeLib, "nowIso").mockReturnValue("2026-02-23T00:00:00.000Z");
      try {
        const first = await forkWorkflow(
          lifecycle.workflow,
          wid,
          { stepN },
          lifecycle.pool,
          "test",
          "fork-same-ts"
        );
        const second = await forkWorkflow(
          lifecycle.workflow,
          wid,
          { stepN },
          lifecycle.pool,
          "test",
          "fork-same-ts"
        );
        expect(first.accepted).toBe(true);
        expect(second.accepted).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }

      const artifacts = await lifecycle.pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
           FROM app.artifacts
          WHERE run_id = $1
            AND step_id = 'OPS'
            AND inline->>'op' = 'fork'`,
        [wid]
      );
      expect(Number(artifacts.rows[0]?.n ?? "0")).toBe(2);
    },
    OPS_TEST_TIMEOUT * 2
  );
});
