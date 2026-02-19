import { describe, it, expect } from "vitest";
import { projectRunHeader, projectStepRows } from "../../src/server/run-view";
import type { RunRow, RunStepRow } from "../../src/db/runRepo";
import type { ArtifactRow } from "../../src/db/artifactRepo";

describe("UI Projections", () => {
  const mockRun: RunRow = {
    id: "r1",
    workflow_id: "wid1",
    status: "succeeded",
    created_at: new Date("2026-02-19T10:00:00Z"),
    updated_at: new Date("2026-02-19T10:05:00Z"),
    trace_id: "t1",
    retry_count: 0,
    last_step: "ExecuteST",
    next_action: null,
    error: null,
  };

  it("should project RunHeader correctly", () => {
    const header = projectRunHeader(mockRun);
    expect(header).toEqual({
      workflowID: "wid1",
      status: "SUCCESS",
      workflowName: "RunIntent",
      createdAt: mockRun.created_at.getTime(),
      updatedAt: mockRun.updated_at.getTime(),
      traceId: "t1",
      error: undefined,
      output: undefined,
      queue: undefined,
      priority: undefined,
    });
  });

  it("should project StepRows with stable sort and artifact join", () => {
    const mockSteps: RunStepRow[] = [
      {
        id: 2,
        runId: "r1",
        stepId: "ApplyPatchST",
        phase: "ApplyPatchST",
        attempt: 1,
        startedAt: new Date("2026-02-19T10:02:00Z"),
        finishedAt: new Date("2026-02-19T10:03:00Z"),
        output: {},
      },
      {
        id: 1,
        runId: "r1",
        stepId: "CompileST",
        phase: "CompileST",
        attempt: 1,
        startedAt: new Date("2026-02-19T10:01:00Z"),
        finishedAt: new Date("2026-02-19T10:02:00Z"),
        output: {},
      },
    ];

    const mockArtifacts: ArtifactRow[] = [
      {
        id: "a1",
        run_id: "r1",
        step_id: "CompileST",
        idx: 0,
        kind: "json",
        uri: "artifact://wid1/CompileST/0",
        sha256: "sha1",
        inline: { foo: "bar" },
        attempt: 1,
        created_at: new Date(),
      }
    ];

    const stepRows = projectStepRows(mockSteps, mockArtifacts, "wid1");

    expect(stepRows).toHaveLength(2);
    // Stable sort check
    expect(stepRows[0].stepID).toBe("CompileST");
    expect(stepRows[1].stepID).toBe("ApplyPatchST");

    // Artifact join check
    expect(stepRows[0].artifactRefs).toHaveLength(1);
    expect(stepRows[0].artifactRefs[0].kind).toBe("json");
    expect(stepRows[0].artifactRefs[0].id).toBe("artifact://wid1/CompileST/0");
    
    expect(stepRows[1].artifactRefs).toHaveLength(0);
  });
});
