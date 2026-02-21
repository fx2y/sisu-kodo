import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { startApp, type AppHandle } from "../../src/server/app";
import { runLoadProbe, type HitlSoakDeps } from "../../scripts/hitl-soak-core";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "../integration/lifecycle";

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; got ${raw}`);
  }
  return parsed;
}

let lc: TestLifecycle;
let app: AppHandle;
let deps: HitlSoakDeps;

beforeAll(async () => {
  lc = await setupLifecycle(20);
  app = await startApp(lc.pool, lc.workflow);
  deps = {
    baseUrl: `http://127.0.0.1:${process.env.PORT ?? "3003"}`,
    appPool: lc.pool,
    sysPool: lc.sysPool
  };
});

afterAll(async () => {
  await new Promise<void>((resolve) => app.server.close(() => resolve()));
  await teardownLifecycle(lc);
});

describe("HITL C7 load probe", () => {
  test("spawns concurrent waits with bounded poll cadence and stable DB pressure", async () => {
    const waits = readInt("HITL_SOAK_TEST_N", 120);
    const lockLimit = readInt("HITL_SOAK_TEST_MAX_WAITING_LOCKS", 250);

    const report = await runLoadProbe(deps, {
      targetWaits: waits,
      pollMs: readInt("HITL_SOAK_TEST_POLL_MS", 1000),
      timeoutMs: readInt("HITL_SOAK_TEST_TIMEOUT_MS", 300000),
      startConcurrency: readInt("HITL_SOAK_TEST_START_CONCURRENCY", 32),
      queuePartitionKey: "hitl-c7-test-load"
    });

    expect(report.waiting.readyCount).toBe(waits);
    expect(report.waiting.erroredCount).toBe(0);
    expect(report.polling.cadenceMs).toBeGreaterThanOrEqual(200);
    expect(report.polling.cadenceMs).toBeLessThanOrEqual(1200);
    expect(report.pressure.maxWaitingLocks).toBeLessThanOrEqual(lockLimit);
    expect(report.targets).toHaveLength(waits);
    const totalWorkflowRows = Object.values(report.pressure.workflowStatusCountsAtReady).reduce(
      (sum, count) => sum + count,
      0
    );
    expect(totalWorkflowRows).toBe(waits);
  }, 360000);
});
