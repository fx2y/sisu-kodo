import { describe, expect, it } from "vitest";
import type { WorkflowStatus } from "@dbos-inc/dbos-sdk";
import { toWorkflowListInput, toWorkflowOpsSummary } from "../../src/workflow/ops-mapper";

function buildStatus(overrides: Partial<WorkflowStatus> = {}): WorkflowStatus {
  return {
    workflowID: "wf_123",
    status: "SUCCESS",
    workflowName: "RunIntent",
    workflowClassName: "IntentWorkflow",
    createdAt: 1_700_000_000_000,
    ...overrides
  } as WorkflowStatus;
}

describe("toWorkflowOpsSummary", () => {
  it("falls back workflowClassName to workflowName when class name is blank", () => {
    const summary = toWorkflowOpsSummary(buildStatus({ workflowClassName: "   " }));
    expect(summary.workflowName).toBe("RunIntent");
    expect(summary.workflowClassName).toBe("RunIntent");
  });

  it("falls back workflowName/class to workflowID when both are blank", () => {
    const summary = toWorkflowOpsSummary(
      buildStatus({ workflowName: "", workflowClassName: "", workflowID: "wf_fallback" })
    );
    expect(summary.workflowName).toBe("wf_fallback");
    expect(summary.workflowClassName).toBe("wf_fallback");
  });
});

describe("toWorkflowListInput", () => {
  it("enforces descending order so limit windows are recency-first", () => {
    const input = toWorkflowListInput({ limit: 20 });
    expect(input.limit).toBe(20);
    expect(input.sortDesc).toBe(true);
  });
});
