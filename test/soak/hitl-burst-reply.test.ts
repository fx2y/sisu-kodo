import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { startApp, type AppHandle } from "../../src/server/app";
import { runBurstReplyProbe, runLoadProbe, type HitlSoakDeps } from "../../scripts/hitl-soak-core";
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

describe("HITL C7 burst drain", () => {
  test("drains mixed new+duplicate dedupe burst without duplicate decisions", async () => {
    const waits = readInt("HITL_SOAK_TEST_N", 120);
    const load = await runLoadProbe(deps, {
      targetWaits: waits,
      pollMs: readInt("HITL_SOAK_TEST_POLL_MS", 1000),
      timeoutMs: readInt("HITL_SOAK_TEST_TIMEOUT_MS", 300000),
      startConcurrency: readInt("HITL_SOAK_TEST_START_CONCURRENCY", 32),
      queuePartitionKey: "hitl-c7-test-burst"
    });

    const burst = await runBurstReplyProbe(deps, load.targets, {
      pollMs: readInt("HITL_SOAK_TEST_POLL_MS", 1000),
      timeoutMs: readInt("HITL_SOAK_TEST_TIMEOUT_MS", 300000),
      replyConcurrency: readInt("HITL_SOAK_TEST_REPLY_CONCURRENCY", 24),
      duplicateRepliesPerGate: readInt("HITL_SOAK_TEST_DUPLICATES", 2),
      dedupePrefix: load.dedupePrefix,
      payload: {
        choice: "yes",
        rationale: "c7-test-burst"
      }
    });

    expect(burst.final.errors).toBe(0);
    expect(burst.final.active).toBe(0);
    expect(burst.final.succeeded).toBe(waits);
    expect(burst.interactions.totalRows).toBe(waits);
    expect(burst.interactions.distinctDedupeKeys).toBe(waits);
    expect(burst.decisions.duplicateDecisionKeys).toBe(0);
    expect(burst.timeline.duplicateStepAttempts).toBe(0);
    expect(burst.timeline.nonMonotonicStartedAtRows).toBe(0);
    expect(burst.workflowStatusCounts.SUCCESS ?? 0).toBe(waits);
  }, 360000);
});
