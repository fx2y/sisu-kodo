import { getPool } from "../../db/pool";
import { insertArtifact } from "../../db/artifactRepo";
import type { ExecutionResult } from "./execute.step";
import { sha256 } from "../../lib/hash";
import { getConfig } from "../../config";
import { assertArtifactIndex, type ArtifactIndex } from "../../contracts";
import { buildArtifactUri } from "../../lib/artifact-uri";

type ArtifactEntry = {
  kind: string;
  uri: string;
  sha256: string;
  inline?: Record<string, unknown>;
};

const deterministicCreatedAt = "1970-01-01T00:00:00.000Z";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class SaveArtifactsStepImpl {
  async emitBudgetArtifact(
    runId: string,
    payload: {
      metric: string;
      scope: "ingress" | "runtime";
      limit: number;
      observed: number;
      unit: string;
      outcome: "blocked";
      reason: string;
    },
    attempt: number = 1
  ): Promise<string> {
    const pool = getPool();
    const uri = buildArtifactUri({
      runId,
      stepId: "BUDGET",
      taskKey: payload.metric,
      name: `${payload.metric}.json`
    });
    await insertArtifact(
      pool,
      runId,
      "BUDGET",
      0,
      {
        kind: "json_diagnostic",
        uri,
        inline: { json: { kind: "budget", ...payload } },
        sha256: sha256({ kind: "budget", ...payload })
      },
      payload.metric,
      attempt
    );
    return uri;
  }

  async execute(
    runId: string,
    stepId: string,
    result: ExecutionResult,
    attempt: number = 1
  ): Promise<string> {
    const pool = getPool();
    const cfg = getConfig();
    const provider =
      isRecord(result.raw) && typeof result.raw.provider === "string"
        ? result.raw.provider
        : cfg.sbxMode === "mock"
          ? "mock"
          : cfg.sbxProvider;

    const entries: ArtifactEntry[] = [];

    const stdoutUri = buildArtifactUri({
      runId,
      stepId,
      taskKey: result.taskKey,
      name: "stdout.log"
    });
    entries.push({
      kind: "stdout",
      uri: stdoutUri,
      sha256: sha256(result.stdout),
      inline: { text: result.stdout }
    });

    const stderrUri = buildArtifactUri({
      runId,
      stepId,
      taskKey: result.taskKey,
      name: "stderr.log"
    });
    entries.push({
      kind: "stderr",
      uri: stderrUri,
      sha256: sha256(result.stderr),
      inline: { text: result.stderr }
    });

    const sortedFiles = [...result.filesOut].sort((left, right) =>
      left.path.localeCompare(right.path)
    );
    for (const file of sortedFiles) {
      entries.push({
        kind: "file",
        uri: buildArtifactUri({
          runId,
          stepId,
          taskKey: result.taskKey,
          name: `files/${file.path}`
        }),
        sha256: file.sha256,
        inline: file.inline ? { text: file.inline } : undefined
      });
    }

    const rawPayload = result.raw ?? {};
    const rawUri = buildArtifactUri({ runId, stepId, taskKey: result.taskKey, name: "raw.json" });
    entries.push({
      kind: "raw",
      uri: rawUri,
      sha256: sha256(rawPayload),
      inline: { json: rawPayload }
    });

    const metricsUri = buildArtifactUri({
      runId,
      stepId,
      taskKey: result.taskKey,
      name: "metrics.json"
    });
    entries.push({
      kind: "timings",
      uri: metricsUri,
      sha256: sha256(result.metrics),
      inline: { json: result.metrics }
    });

    const templateMeta =
      isRecord(rawPayload) && isRecord(rawPayload.template) ? rawPayload.template : undefined;
    const bootMs =
      isRecord(rawPayload) && typeof rawPayload.bootMs === "number" ? rawPayload.bootMs : undefined;
    if (templateMeta || bootMs !== undefined) {
      const bootDiag: Record<string, unknown> = {};
      if (bootMs !== undefined) bootDiag.bootMs = bootMs;
      if (templateMeta) {
        if (typeof templateMeta.source === "string") bootDiag.source = templateMeta.source;
        if (typeof templateMeta.templateId === "string")
          bootDiag.templateId = templateMeta.templateId;
        if (typeof templateMeta.templateKey === "string")
          bootDiag.templateKey = templateMeta.templateKey;
        if (typeof templateMeta.depsHash === "string") bootDiag.depsHash = templateMeta.depsHash;
        if (typeof templateMeta.envRef === "string") bootDiag.envRef = templateMeta.envRef;
      }
      entries.push({
        kind: "json_diagnostic",
        uri: buildArtifactUri({
          runId,
          stepId,
          taskKey: result.taskKey,
          name: "sbx-boot.json"
        }),
        sha256: sha256(bootDiag),
        inline: { json: bootDiag }
      });
    }

    const orderedEntries = [...entries].sort((left, right) => left.uri.localeCompare(right.uri));
    const index: ArtifactIndex = {
      taskKey: result.taskKey,
      provider,
      items: orderedEntries.map((entry) => ({
        kind: entry.kind,
        uri: entry.uri,
        sha256: entry.sha256
      })),
      rawRef: rawUri,
      createdAt: deterministicCreatedAt
    };
    assertArtifactIndex(index);

    const indexUri = buildArtifactUri({
      runId,
      stepId,
      taskKey: result.taskKey,
      name: "index.json"
    });
    await insertArtifact(
      pool,
      runId,
      stepId,
      0,
      {
        kind: "artifact_index",
        uri: indexUri,
        inline: { json: index },
        sha256: sha256(index)
      },
      result.taskKey,
      attempt
    );

    let idx = 1;
    for (const entry of orderedEntries) {
      await insertArtifact(
        pool,
        runId,
        stepId,
        idx,
        {
          kind: entry.kind,
          uri: entry.uri,
          inline: entry.inline,
          sha256: entry.sha256
        },
        result.taskKey,
        attempt
      );
      idx++;
    }

    return indexUri;
  }
}
