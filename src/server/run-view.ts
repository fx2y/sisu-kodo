import type { RunRow, RunStepRow } from "../db/runRepo";
import type { ArtifactRef } from "../contracts/artifact-ref.schema";
import type { ArtifactRow } from "../db/artifactRepo";
import type { RunView } from "../contracts/run-view.schema";
import { mapRunStatus } from "../contracts/ui/status-map";
import type { RunHeader } from "../contracts/ui/run-header.schema";
import type { StepRow } from "../contracts/ui/step-row.schema";
import type { ArtifactRefV1 } from "../contracts/ui/artifact-ref-v1.schema";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function projectRunHeader(run: RunRow): RunHeader {
  return {
    workflowID: run.workflow_id,
    status: mapRunStatus(run.status),
    workflowName: "RunIntent", // Hardcoded for now as it's the only one
    createdAt: run.created_at.getTime(),
    updatedAt: run.updated_at.getTime(),
    queue: undefined, // Not persisted yet
    priority: undefined, // Not persisted yet
    error: run.error ? { message: run.error } : undefined,
    output: undefined, // Not persisted in app.runs
    traceId: run.trace_id
  };
}

export function projectStepRows(
  steps: RunStepRow[],
  artifacts: ArtifactRow[],
  workflowId: string
): StepRow[] {
  const projected = steps.map((s) => {
    const stepArtifacts = artifacts.filter(
      (a) => a.step_id === s.stepId && a.attempt === s.attempt
    );

    return {
      stepID: s.stepId,
      name: s.phase,
      attempt: s.attempt,
      startedAt: s.startedAt?.getTime() ?? 0,
      endedAt: s.finishedAt?.getTime() ?? undefined,
      error: isRecord(s.output) && s.output.error ? s.output.error : undefined,
      artifactRefs: stepArtifacts.map((a) => ({
        id: a.uri || `artifact://${workflowId}/${s.stepId}/${a.idx}`,
        workflowID: workflowId,
        stepID: a.step_id,
        kind: a.kind,
        mime: a.kind === "json" ? "application/json" : "text/plain",
        size: 0, // Not persisted yet
        previewHint: undefined,
        storageKey: a.uri
      }))
    };
  });

  return projected.sort((a, b) => a.startedAt - b.startedAt || a.stepID.localeCompare(b.stepID));
}

export function projectRunView(
  run: RunRow,
  steps: RunStepRow[],
  artifacts: ArtifactRef[]
): RunView {
  // Deterministic key order by explicit object creation
  return {
    runId: run.id,
    workflowId: run.workflow_id,
    status: run.status,
    steps: steps.map((s) => ({
      stepId: s.stepId,
      phase: s.phase,
      output: isRecord(s.output) ? s.output : undefined,
      startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : s.startedAt,
      finishedAt: s.finishedAt instanceof Date ? s.finishedAt.toISOString() : s.finishedAt
    })),
    artifacts: artifacts.map((a) => ({
      kind: a.kind,
      uri: a.uri,
      inline: a.inline,
      sha256: a.sha256
    })),
    traceId: run.trace_id,
    lastStep: run.last_step,
    error: run.error ?? undefined,
    retryCount: run.retry_count,
    nextAction: run.next_action ?? undefined
  };
}
