import { describe, it, expect } from "vitest";
import { assertRunHeader, assertStepRow, mapRunStatus, STATUS_MAP } from "../../src/contracts";
import { projectRunHeader, projectStepRows } from "../../src/server/run-view";
import type { RunRow, RunStepRow } from "../../src/db/runRepo";
import type { ArtifactRow } from "../../src/db/artifactRepo";

describe("UI Contracts & Projectors", () => {
  const mockRun: RunRow = {
    id: "run_123",
    intent_id: "it_123",
    workflow_id: "wf_123",
    status: "running",
    created_at: new Date("2026-02-19T10:00:00Z"),
    updated_at: new Date("2026-02-19T10:05:00Z"),
    retry_count: 0
  };

  const mockSteps: RunStepRow[] = [
    {
      stepId: "Step1",
      phase: "Phase1",
      attempt: 1,
      startedAt: new Date("2026-02-19T10:01:00Z"),
      finishedAt: new Date("2026-02-19T10:02:00Z"),
      output: { foo: "bar" }
    }
  ];

  const mockArtifacts: ArtifactRow[] = [
    {
      run_id: "run_123",
      step_id: "Step1",
      task_key: "",
      idx: 0,
      attempt: 1,
      kind: "json",
      uri: "artifact://run/run_123/step/Step1/task//index.json",
      sha256: "7f6f823456d5f7f4a3f58f97a7b8f7de50291d72e4a8ee7ebcb03cb3217709af",
      created_at: new Date(),
      inline: { data: "test" }
    }
  ];

  it("should project RunHeader correctly", () => {
    const header = projectRunHeader(mockRun, {
      traceBaseUrl: "https://trace.local/trace/{traceId}"
    });
    expect(header.workflowID).toBe("wf_123");
    expect(header.status).toBe("PENDING");
    expect(header.createdAt).toBe(mockRun.created_at.getTime());
    expect(header.traceBaseUrl).toBe("https://trace.local/trace/{traceId}");
    expect(header.spanId).toBeNull();
    expect(() => assertRunHeader(header)).not.toThrow();
  });

  it("should project StepRows correctly", () => {
    const rows = projectStepRows(mockSteps, mockArtifacts, "wf_123");
    expect(rows).toHaveLength(1);
    expect(rows[0].stepID).toBe("Step1");
    expect(rows[0].artifactRefs).toHaveLength(1);
    expect(rows[0].artifactRefs[0].kind).toBe("json");
    expect(() => assertStepRow(rows[0])).not.toThrow();
  });

  it("should sort StepRows by startedAt", () => {
    const steps: RunStepRow[] = [
      { stepId: "B", phase: "P", attempt: 1, startedAt: new Date(2000) },
      { stepId: "A", phase: "P", attempt: 1, startedAt: new Date(1000) }
    ];
    const rows = projectStepRows(steps, [], "wf");
    expect(rows[0].stepID).toBe("A");
    expect(rows[1].stepID).toBe("B");
  });

  it("should map all RunStatus values correctly", () => {
    Object.keys(STATUS_MAP).forEach((status) => {
      const mapped = mapRunStatus(status as keyof typeof STATUS_MAP);
      expect(mapped).toBeDefined();
    });
  });

  it("should fail validation on unknown fields", () => {
    const badHeader = { ...projectRunHeader(mockRun), extra: "field" };
    expect(() => assertRunHeader(badHeader)).toThrow();
  });
});
