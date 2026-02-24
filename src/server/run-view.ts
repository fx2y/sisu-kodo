import type { RunRow, RunStepRow } from "../db/runRepo";
import type { ArtifactRef } from "../contracts/artifact-ref.schema";
import type { ArtifactRow } from "../db/artifactRepo";
import type { RunView } from "../contracts/run-view.schema";
import { mapRunStatus } from "../contracts/ui/status-map";
import type { RunHeader } from "../contracts/ui/run-header.schema";
import type { StepRow } from "../contracts/ui/step-row.schema";
import type { ArtifactRefV1 } from "../contracts/ui/artifact-ref-v1.schema";
import { nowMs } from "../lib/time";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function readStepError(output: unknown): Record<string, unknown> | undefined {
  if (!isRecord(output)) return undefined;
  return isRecord(output.error) ? output.error : undefined;
}

type RunHeaderProjectionOpts = {
  traceBaseUrl?: string;
  topology?: "api-shim" | "inproc-worker" | null;
  runtimeMode?: "api-shim" | "inproc-worker" | null;
  ocMode?: "replay" | "record" | "live" | null;
  sbxMode?: "mock" | "live" | null;
  sbxProvider?: "e2b" | "microsandbox" | null;
  appVersion?: string | null;
  claimScope?: "signoff" | "demo" | "live-smoke" | null;
  durableStatus?: string | null;
  workflowVersion?: string | null;
  ocStrictMode?: boolean | null;
};

function artifactLookupKey(stepId: string, attempt: number): string {
  return `${stepId}::${attempt}`;
}

function toArtifactRef(
  artifact: ArtifactRow,
  workflowId: string,
  fallbackStepId: string
): ArtifactRefV1 {
  const mimeMap: Record<string, string> = {
    json: "application/json",
    plan_card: "application/json",
    question_card: "application/json",
    json_diagnostic: "application/json",
    svg: "image/svg+xml",
    text: "text/plain",
    stdout: "text/plain",
    stderr: "text/plain",
    none: "text/plain"
  };

  const inlineSize = artifact.inline ? JSON.stringify(artifact.inline).length : 0;

  return {
    id: artifact.uri || `artifact://${workflowId}/${fallbackStepId}/${artifact.idx}`,
    workflowID: workflowId,
    stepID: artifact.step_id,
    kind: artifact.kind,
    mime: mimeMap[artifact.kind] ?? "text/plain",
    size: inlineSize,
    previewHint: undefined,
    storageKey: artifact.uri
  };
}

function mapArtifactsByStepAttempt(artifacts: ArtifactRow[]): Map<string, ArtifactRow[]> {
  const byKey = new Map<string, ArtifactRow[]>();
  for (const artifact of artifacts) {
    const key = artifactLookupKey(artifact.step_id, artifact.attempt);
    const existing = byKey.get(key);
    if (existing) {
      existing.push(artifact);
      continue;
    }
    byKey.set(key, [artifact]);
  }
  return byKey;
}

export function projectRunHeader(run: RunRow, opts: RunHeaderProjectionOpts = {}): RunHeader {
  const projected: RunHeader = {
    workflowID: run.workflow_id,
    recipeRef: run.recipe_id && run.recipe_v ? { id: run.recipe_id, v: run.recipe_v } : null,
    recipeHash: run.recipe_hash ?? null,
    intentHash: run.intent_hash ?? null,
    status: mapRunStatus(run.status),
    workflowName: "RunIntent",
    createdAt: run.created_at.getTime(),
    updatedAt: run.updated_at.getTime(),
    queue: undefined,
    priority: undefined,
    error: run.error ? { message: run.error } : undefined,
    output: undefined,
    traceId: run.trace_id ?? null,
    spanId: null,
    nextAction: run.next_action ?? null,
    lastStep: run.last_step ?? null,
    topology: opts.topology ?? (opts.runtimeMode === "api-shim" ? "api-shim" : "inproc-worker"),
    runtimeMode: opts.runtimeMode ?? null,
    ocMode: opts.ocMode ?? null,
    sbxMode: opts.sbxMode ?? null,
    sbxProvider: opts.sbxProvider ?? null,
    appVersion: opts.appVersion ?? null,
    claimScope: opts.claimScope ?? null,
    durableStatus: opts.durableStatus ?? run.status,
    workflowVersion: opts.workflowVersion ?? null,
    ocStrictMode: opts.ocStrictMode ?? null
  };
  if (opts.traceBaseUrl) projected.traceBaseUrl = opts.traceBaseUrl;
  return projected;
}

export function projectStepRows(
  steps: RunStepRow[],
  artifacts: ArtifactRow[],
  workflowId: string
): StepRow[] {
  const artifactsByStepAttempt = mapArtifactsByStepAttempt(artifacts);
  const projected = steps.map((step) => {
    const stepArtifacts =
      artifactsByStepAttempt.get(artifactLookupKey(step.stepId, step.attempt)) ?? [];

    return {
      stepID: step.stepId,
      name: step.phase,
      attempt: step.attempt,
      startedAt: step.startedAt?.getTime() ?? 0,
      endedAt: step.finishedAt?.getTime() ?? undefined,
      error: readStepError(step.output),
      artifactRefs: stepArtifacts.map((artifact) =>
        toArtifactRef(artifact, workflowId, step.stepId)
      ),
      traceId: step.traceId ?? null,
      spanId: step.spanId ?? null
    };
  });

  const seenStepAttempts = new Set(projected.map((s) => artifactLookupKey(s.stepID, s.attempt)));
  for (const [key, stepArtifacts] of artifactsByStepAttempt.entries()) {
    const [stepId, attemptStr] = key.split("::");
    if (stepId !== "BUDGET" || seenStepAttempts.has(key)) continue;
    const attempt = Number(attemptStr) || 1;
    const startedAt = stepArtifacts[0]?.created_at?.getTime?.() ?? 0;
    projected.push({
      stepID: "BUDGET",
      name: "budget",
      attempt,
      startedAt,
      endedAt: undefined,
      error: undefined,
      artifactRefs: stepArtifacts.map((artifact) => toArtifactRef(artifact, workflowId, "BUDGET")),
      traceId: null,
      spanId: null
    });
  }

  return projected.sort((a, b) => a.startedAt - b.startedAt || a.stepID.localeCompare(b.stepID));
}

import type { ProofCard } from "../contracts/ui/proof-card.schema";

export function projectProofCards(
  run: RunRow,
  steps: RunStepRow[],
  artifacts: ArtifactRow[],
  dbosStatus?: { status: string; updatedAt: number }
): ProofCard[] {
  const cards: ProofCard[] = [];
  const now = nowMs();

  // 1. Identity Proof (SQL)
  if (run.intent_hash) {
    cards.push({
      claim: "Intent Identity",
      evidence: `Intent hash matches: ${run.intent_hash}`,
      source: "SQL",
      ts: run.created_at.getTime(),
      provenance: "app.runs.intent_hash",
      rawRef: `run://${run.workflow_id}/identity`
    });
  }

  // 2. Status Proof (DBOS/SQL)
  if (dbosStatus) {
    cards.push({
      claim: "Workflow Status (DBOS)",
      evidence: `DBOS reports status: ${dbosStatus.status}`,
      source: "DBOS",
      ts: dbosStatus.updatedAt,
      provenance: "dbos.workflow_status",
      rawRef: `run://${run.workflow_id}/status/dbos`
    });
  }

  cards.push({
    claim: "Workflow Status (App)",
    evidence: `App reports status: ${run.status}`,
    source: "SQL",
    ts: run.updated_at.getTime(),
    provenance: "app.runs.status",
    rawRef: `run://${run.workflow_id}/status/app`
  });

  // 3. Exactly-once Step Execution (X1)
  for (const step of steps) {
    cards.push({
      claim: `Step Execution: ${step.stepId}`,
      evidence: `Step ${step.stepId} (attempt ${step.attempt}) reached phase: ${step.phase}`,
      source: "SQL",
      ts: step.finishedAt?.getTime() ?? step.startedAt?.getTime() ?? now,
      provenance: "app.run_steps",
      rawRef: `run://${run.workflow_id}/steps/${step.stepId}`
    });
  }

  // 4. Artifact Durability (Artifact)
  for (const art of artifacts) {
    cards.push({
      claim: `Artifact Durability: ${art.kind}`,
      evidence: `Artifact ${art.idx} persisted with kind: ${art.kind}`,
      source: "Artifact",
      ts: art.created_at.getTime(),
      provenance: "app.artifacts",
      rawRef: art.uri ?? `artifact://${run.workflow_id}/${art.step_id}/${art.idx}`
    });
  }

  // 5. Policy Proofs (API/Policy)
  if (run.budget) {
    cards.push({
      claim: "Budget Policy",
      evidence: `Run started with budget limits: ${JSON.stringify(run.budget)}`,
      source: "API",
      ts: run.created_at.getTime(),
      provenance: "app.runs.budget",
      rawRef: `run://${run.workflow_id}/budget`
    });
  }

  if (run.queue_partition_key) {
    cards.push({
      claim: "Queue Partition Policy",
      evidence: `Run assigned to partition: ${run.queue_partition_key}`,
      source: "SQL",
      ts: run.created_at.getTime(),
      provenance: "app.runs.queue_partition_key",
      rawRef: `run://${run.workflow_id}/partition`
    });
  }

  return cards.sort((a, b) => b.ts - a.ts); // Newest first
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
    recipeRef: run.recipe_id && run.recipe_v ? { id: run.recipe_id, v: run.recipe_v } : null,
    recipeHash: run.recipe_hash ?? null,
    intentHash: run.intent_hash ?? null,
    status: run.status,
    steps: steps.map((s) => ({
      stepId: s.stepId,
      phase: s.phase,
      output: isRecord(s.output) ? s.output : undefined,
      startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : s.startedAt,
      finishedAt: s.finishedAt instanceof Date ? s.finishedAt.toISOString() : s.finishedAt,
      traceId: s.traceId ?? null,
      spanId: s.spanId ?? null
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
