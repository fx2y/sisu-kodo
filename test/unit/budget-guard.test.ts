import { describe, expect, test } from "vitest";
import {
  BudgetGuardError,
  assertIngressBudget,
  assertRuntimeExecutionBudgets,
  assertRuntimeTaskFanoutBudget,
  assertRuntimeWallClockBudget,
  estimateResultArtifactsMB,
  maxObservedExecuteAttempt
} from "../../src/workflow/budget-guard";

describe("budget guard", () => {
  const budget = {
    maxFanout: 2,
    maxSBXMinutes: 1,
    maxArtifactsMB: 1,
    maxRetriesPerStep: 0,
    maxWallClockMS: 1000
  } as const;

  test("ingress precheck rejects oversized workload", () => {
    expect(() =>
      assertIngressBudget({
        budget,
        workload: { concurrency: 1, steps: 3, sandboxMinutes: 1 },
        timeoutMS: 500
      })
    ).toThrowError(BudgetGuardError);
  });

  test("runtime checks enforce fanout/wallclock", () => {
    expect(() => assertRuntimeTaskFanoutBudget(budget, 3)).toThrowError(BudgetGuardError);
    expect(() => assertRuntimeWallClockBudget(budget, 1001)).toThrowError(BudgetGuardError);
  });

  test("runtime execute checks enforce sbx/artifacts/retries", () => {
    expect(() =>
      assertRuntimeExecutionBudgets(budget, { sbxWallMs: 61000, artifactMB: 1, maxAttempt: 1 })
    ).toThrowError(BudgetGuardError);
    expect(() =>
      assertRuntimeExecutionBudgets(budget, { sbxWallMs: 1, artifactMB: 2, maxAttempt: 1 })
    ).toThrowError(BudgetGuardError);
    expect(() =>
      assertRuntimeExecutionBudgets(budget, { sbxWallMs: 1, artifactMB: 1, maxAttempt: 2 })
    ).toThrowError(BudgetGuardError);
  });

  test("artifact estimator and attempt parser are deterministic", () => {
    const mb = estimateResultArtifactsMB({
      stdout: "x".repeat(64),
      stderr: "",
      filesOut: [{ inline: "y".repeat(64) }],
      raw: { a: 1 },
      metrics: { wallMs: 1 }
    });
    expect(mb).toBe(1);
    expect(maxObservedExecuteAttempt({ attempt: 2, tasks: [{ attempt: 1 }, { attempt: 3 }] })).toBe(3);
    expect(maxObservedExecuteAttempt(undefined)).toBe(1);
  });
});
