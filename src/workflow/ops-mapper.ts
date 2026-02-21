import type { GetWorkflowsInput, WorkflowStatus } from "@dbos-inc/dbos-sdk";
import type {
  WorkflowOpsListQuery,
  WorkflowOpsStatus,
  WorkflowOpsStep,
  WorkflowOpsStepStatus,
  WorkflowOpsSummary
} from "./port";

function toWorkflowOpsStatus(status: string): WorkflowOpsStatus {
  switch (status) {
    case "PENDING":
    case "SUCCESS":
    case "ERROR":
    case "MAX_RECOVERY_ATTEMPTS_EXCEEDED":
    case "CANCELLED":
    case "ENQUEUED":
      return status;
    default:
      throw new Error(`unsupported workflow status: ${status}`);
  }
}

type WorkflowStepInfo = {
  functionID: unknown;
  name: string;
  error: unknown;
  startedAtEpochMs?: unknown;
  completedAtEpochMs?: unknown;
};

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return undefined;
}

function toNumberOrThrow(value: unknown, field: string): number {
  const parsed = toOptionalNumber(value);
  if (parsed === undefined) {
    throw new Error(`invalid ${field}: expected numeric timestamp`);
  }
  return parsed;
}

function toWorkflowOpsStepStatus(step: WorkflowStepInfo): WorkflowOpsStepStatus {
  if (toOptionalNumber(step.completedAtEpochMs) === undefined) {
    return "PENDING";
  }
  return step.error ? "ERROR" : "SUCCESS";
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return fallback;
}

export function toWorkflowListInput(query: WorkflowOpsListQuery): GetWorkflowsInput {
  const out: GetWorkflowsInput = {};
  // Ops list must be recency-first so bounded limits include newest workflows.
  out.sortDesc = true;
  if (query.status !== undefined) {
    out.status = query.status;
  }
  if (query.name !== undefined) {
    out.workflowName = query.name;
  }
  if (query.limit !== undefined) {
    out.limit = query.limit;
  }
  return out;
}

export function toWorkflowOpsSummary(status: WorkflowStatus): WorkflowOpsSummary {
  const workflowName = toNonEmptyString(status.workflowName, status.workflowID);
  const workflowClassName = toNonEmptyString(status.workflowClassName, workflowName);
  return {
    workflowID: status.workflowID,
    status: toWorkflowOpsStatus(status.status),
    workflowName,
    workflowClassName,
    queueName: status.queueName ?? undefined,
    applicationVersion: status.applicationVersion ?? undefined,
    createdAt: toNumberOrThrow(status.createdAt, "createdAt"),
    updatedAt: toOptionalNumber(status.updatedAt)
  };
}

export function toWorkflowOpsStep(step: WorkflowStepInfo): WorkflowOpsStep {
  const functionId =
    typeof step.functionID === "number"
      ? step.functionID
      : toNumberOrThrow(step.functionID, "stepID");
  return {
    stepId: step.name,
    functionId,
    status: toWorkflowOpsStepStatus(step),
    startedAt: toOptionalNumber(step.startedAtEpochMs),
    completedAt: toOptionalNumber(step.completedAtEpochMs),
    error: step.error === null ? undefined : stringifyError(step.error)
  };
}
