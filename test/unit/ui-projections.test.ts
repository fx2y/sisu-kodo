import { describe, expect, it } from "vitest";
import type { ArtifactRow } from "../../src/db/artifactRepo";
import type { RunRow, RunStepRow } from "../../src/db/runRepo";
import { projectRunHeader, projectStepRows } from "../../src/server/run-view";

describe("UI projections", () => {
  const run: RunRow = {
    id: "r1",
    intent_id: "it1",
    workflow_id: "wid1",
    status: "succeeded",
    created_at: new Date("2026-02-19T10:00:00Z"),
    updated_at: new Date("2026-02-19T10:05:00Z"),
    trace_id: "trace-run-1",
    retry_count: 0,
    last_step: "ExecuteST",
    next_action: null,
    error: null
  };

  it("projects RunHeader with optional trace base URL", () => {
    const header = projectRunHeader(run, {
      traceBaseUrl: "https://trace.local/trace/{traceId}"
    });

    expect(header).toEqual({
      workflowID: "wid1",
      status: "SUCCESS",
      workflowName: "RunIntent",
      createdAt: run.created_at.getTime(),
      updatedAt: run.updated_at.getTime(),
      queue: undefined,
      priority: undefined,
      error: undefined,
      output: undefined,
      traceId: "trace-run-1",
      spanId: null,
      traceBaseUrl: "https://trace.local/trace/{traceId}",
      nextAction: null
    });
  });

  it("projects StepRows with stable ordering and attempt-aware artifact join", () => {
    const steps: RunStepRow[] = [
      {
        stepId: "ApplyPatchST",
        phase: "ApplyPatchST",
        attempt: 1,
        startedAt: new Date("2026-02-19T10:02:00Z"),
        finishedAt: new Date("2026-02-19T10:03:00Z"),
        output: {},
        traceId: "trace-step-2",
        spanId: "span-step-2"
      },
      {
        stepId: "CompileST",
        phase: "CompileST",
        attempt: 2,
        startedAt: new Date("2026-02-19T10:01:00Z"),
        finishedAt: new Date("2026-02-19T10:02:00Z"),
        output: {},
        traceId: "trace-step-1",
        spanId: "span-step-1"
      }
    ];

    const artifacts: ArtifactRow[] = [
      {
        run_id: "r1",
        step_id: "CompileST",
        task_key: "",
        idx: 0,
        kind: "json",
        uri: "artifact://wid1/CompileST/0",
        sha256: "87f8ec1b568f9c9efc3fef5d58eb91ef2e36e2c7844f9098c4dd63dc6d4f6ed5",
        inline: { foo: "bar" },
        attempt: 2,
        created_at: new Date("2026-02-19T10:02:00Z")
      },
      {
        run_id: "r1",
        step_id: "CompileST",
        task_key: "",
        idx: 1,
        kind: "json",
        uri: "artifact://wid1/CompileST/1",
        sha256: "7d04c5f93aa726f3333f95b7254f50d692f75dce9f400ee55615ef0afcf3b759",
        inline: { foo: "old-attempt" },
        attempt: 1,
        created_at: new Date("2026-02-19T10:01:59Z")
      }
    ];

    const rows = projectStepRows(steps, artifacts, "wid1");

    expect(rows).toHaveLength(2);
    expect(rows[0].stepID).toBe("CompileST");
    expect(rows[1].stepID).toBe("ApplyPatchST");

    expect(rows[0].artifactRefs).toHaveLength(1);
    expect(rows[0].artifactRefs[0].id).toBe("artifact://wid1/CompileST/0");
    expect(rows[0].traceId).toBe("trace-step-1");
    expect(rows[0].spanId).toBe("span-step-1");

    expect(rows[1].artifactRefs).toHaveLength(0);
    expect(rows[1].traceId).toBe("trace-step-2");
    expect(rows[1].spanId).toBe("span-step-2");
  });
});
