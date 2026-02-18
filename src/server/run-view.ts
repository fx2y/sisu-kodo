import type { RunRow, RunStepRow } from "../db/runRepo";
import type { ArtifactRef } from "../contracts/artifact-ref.schema";
import type { RunView } from "../contracts/run-view.schema";

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
      output:
        typeof s.output === "object" && s.output !== null && !Array.isArray(s.output)
          ? (s.output as Record<string, unknown>)
          : undefined,
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
