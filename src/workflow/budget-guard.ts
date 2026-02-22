import type { RunBudget, RunRequest } from "../contracts/run-request.schema";

export type BudgetMetric =
  | "maxFanout"
  | "maxSBXMinutes"
  | "maxArtifactsMB"
  | "maxRetriesPerStep"
  | "maxWallClockMS";

export type BudgetScope = "ingress" | "runtime";

export type BudgetViolation = {
  metric: BudgetMetric;
  scope: BudgetScope;
  limit: number;
  observed: number;
  unit: "count" | "minutes" | "mb" | "ms" | "retries";
};

export class BudgetGuardError extends Error {
  public readonly code = "budget_violation";

  constructor(public readonly violation: BudgetViolation) {
    super(
      `budget:${violation.metric}: observed ${violation.observed} > limit ${violation.limit} (${violation.scope})`
    );
    this.name = "BudgetGuardError";
  }
}

function toMB(bytes: number): number {
  return Math.ceil(bytes / (1024 * 1024));
}

function textBytes(value: string | undefined): number {
  return value ? Buffer.byteLength(value, "utf8") : 0;
}

function jsonBytes(value: unknown): number {
  return value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function estimateResultArtifactsMB(result: {
  stdout?: string;
  stderr?: string;
  filesOut?: Array<{ inline?: string }>;
  raw?: unknown;
  metrics?: unknown;
}): number {
  const filesInlineBytes = (result.filesOut ?? []).reduce((sum, file) => sum + textBytes(file.inline), 0);
  const totalBytes =
    textBytes(result.stdout) +
    textBytes(result.stderr) +
    filesInlineBytes +
    jsonBytes(result.raw) +
    jsonBytes(result.metrics);
  return toMB(totalBytes);
}

export function maxObservedExecuteAttempt(raw: unknown): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 1;
  const root = raw as Record<string, unknown>;
  let maxAttempt = typeof root.attempt === "number" ? root.attempt : 1;
  const tasks = Array.isArray(root.tasks) ? root.tasks : [];
  for (const task of tasks) {
    if (!task || typeof task !== "object" || Array.isArray(task)) continue;
    const attempt = (task as Record<string, unknown>).attempt;
    if (typeof attempt === "number") {
      maxAttempt = Math.max(maxAttempt, attempt);
    }
  }
  return maxAttempt;
}

export function assertIngressBudget(req: Pick<RunRequest, "budget" | "workload" | "timeoutMS">): void {
  const budget = req.budget;
  if (!budget) return;
  if (req.workload && req.workload.steps > budget.maxFanout) {
    throw new BudgetGuardError({
      metric: "maxFanout",
      scope: "ingress",
      limit: budget.maxFanout,
      observed: req.workload.steps,
      unit: "count"
    });
  }
  if (req.workload && req.workload.sandboxMinutes > budget.maxSBXMinutes) {
    throw new BudgetGuardError({
      metric: "maxSBXMinutes",
      scope: "ingress",
      limit: budget.maxSBXMinutes,
      observed: req.workload.sandboxMinutes,
      unit: "minutes"
    });
  }
  if (typeof req.timeoutMS === "number" && req.timeoutMS > budget.maxWallClockMS) {
    throw new BudgetGuardError({
      metric: "maxWallClockMS",
      scope: "ingress",
      limit: budget.maxWallClockMS,
      observed: req.timeoutMS,
      unit: "ms"
    });
  }
}

export function assertRuntimeTaskFanoutBudget(budget: RunBudget | undefined, taskCount: number): void {
  if (!budget) return;
  if (taskCount > budget.maxFanout) {
    throw new BudgetGuardError({
      metric: "maxFanout",
      scope: "runtime",
      limit: budget.maxFanout,
      observed: taskCount,
      unit: "count"
    });
  }
}

export function assertRuntimeWallClockBudget(
  budget: RunBudget | undefined,
  elapsedMs: number
): void {
  if (!budget) return;
  if (elapsedMs > budget.maxWallClockMS) {
    throw new BudgetGuardError({
      metric: "maxWallClockMS",
      scope: "runtime",
      limit: budget.maxWallClockMS,
      observed: elapsedMs,
      unit: "ms"
    });
  }
}

export function assertRuntimeExecutionBudgets(
  budget: RunBudget | undefined,
  observed: {
    sbxWallMs: number;
    artifactMB: number;
    maxAttempt: number;
  }
): void {
  if (!budget) return;

  const sbxMinutes = Math.ceil(observed.sbxWallMs / 60000);
  if (sbxMinutes > budget.maxSBXMinutes) {
    throw new BudgetGuardError({
      metric: "maxSBXMinutes",
      scope: "runtime",
      limit: budget.maxSBXMinutes,
      observed: sbxMinutes,
      unit: "minutes"
    });
  }

  if (observed.artifactMB > budget.maxArtifactsMB) {
    throw new BudgetGuardError({
      metric: "maxArtifactsMB",
      scope: "runtime",
      limit: budget.maxArtifactsMB,
      observed: observed.artifactMB,
      unit: "mb"
    });
  }

  const observedRetries = Math.max(0, observed.maxAttempt - 1);
  if (observedRetries > budget.maxRetriesPerStep) {
    throw new BudgetGuardError({
      metric: "maxRetriesPerStep",
      scope: "runtime",
      limit: budget.maxRetriesPerStep,
      observed: observedRetries,
      unit: "retries"
    });
  }
}
