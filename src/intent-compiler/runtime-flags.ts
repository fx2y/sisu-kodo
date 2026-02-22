import type { Intent } from "../contracts/intent.schema";

export type IntentRuntimeFlags = {
  openAskGate: boolean;
  parallelApprovals: boolean;
  planApprovalTimeoutS: number;
};

type IntentRuntimeOverrides = {
  openAskGate?: boolean;
  parallelApprovals?: boolean;
  planApprovalTimeoutS?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value));
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value > 0 ? value : undefined;
}

function readLegacyGoalOverrides(goal: string): IntentRuntimeOverrides {
  const normalized = goal.toLowerCase();
  return {
    openAskGate: normalized.includes("ask"),
    parallelApprovals: normalized.includes("parallel test"),
    planApprovalTimeoutS: normalized.includes("timeout test") ? 2 : undefined
  };
}

function readConstraintOverrides(constraints: Record<string, unknown>): IntentRuntimeOverrides {
  const nested = asRecord(constraints.testHooks);
  const source = nested ?? constraints;

  return {
    openAskGate:
      readBoolean(source.askUser) ??
      readBoolean(source.ask_user) ??
      readBoolean(source.waitForHumanInput),
    parallelApprovals:
      readBoolean(source.parallelApprovals) ??
      readBoolean(source.parallel_approvals) ??
      readBoolean(source.parallelGateTest),
    planApprovalTimeoutS:
      readPositiveInt(source.planApprovalTimeoutS) ??
      readPositiveInt(source.plan_approval_timeout_s) ??
      readPositiveInt(source.timeoutS)
  };
}

export function resolveIntentRuntimeFlags(
  intent: Intent,
  defaultPlanApprovalTimeoutS: number
): IntentRuntimeFlags {
  const constraintOverrides = readConstraintOverrides(intent.constraints);
  const legacyOverrides = readLegacyGoalOverrides(intent.goal);

  return {
    openAskGate: constraintOverrides.openAskGate ?? legacyOverrides.openAskGate ?? false,
    parallelApprovals:
      constraintOverrides.parallelApprovals ?? legacyOverrides.parallelApprovals ?? false,
    planApprovalTimeoutS:
      constraintOverrides.planApprovalTimeoutS ??
      legacyOverrides.planApprovalTimeoutS ??
      defaultPlanApprovalTimeoutS
  };
}
