import { getPool } from "../../db/pool";
import { insertArtifact } from "../../db/artifactRepo";
import type { ExecutionResult } from "./execute.step";
import { sha256 } from "../../lib/hash";
import { getConfig } from "../../config";
import { assertArtifactIndex, type ArtifactIndex } from "../../contracts";

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

function artifactUri(runId: string, stepId: string, taskKey: string, name: string): string {
  return `artifact://run/${runId}/step/${stepId}/task/${taskKey}/${name}`;
}

export class SaveArtifactsStepImpl {
  async execute(runId: string, stepId: string, result: ExecutionResult): Promise<void> {
    const pool = getPool();
    const cfg = getConfig();
    const provider =
      isRecord(result.raw) && typeof result.raw.provider === "string"
        ? result.raw.provider
        : cfg.sbxMode === "mock"
          ? "mock"
          : cfg.sbxProvider;

    const entries: ArtifactEntry[] = [];

    const stdoutUri = artifactUri(runId, stepId, result.taskKey, "stdout.log");
    entries.push({
      kind: "stdout",
      uri: stdoutUri,
      sha256: sha256(result.stdout),
      inline: { text: result.stdout }
    });

    const stderrUri = artifactUri(runId, stepId, result.taskKey, "stderr.log");
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
        uri: artifactUri(runId, stepId, result.taskKey, `files/${file.path}`),
        sha256: file.sha256,
        inline: file.inline ? { text: file.inline } : undefined
      });
    }

    const rawPayload = result.raw ?? {};
    const rawUri = artifactUri(runId, stepId, result.taskKey, "raw.json");
    entries.push({
      kind: "raw",
      uri: rawUri,
      sha256: sha256(rawPayload),
      inline: { json: rawPayload }
    });

    const metricsUri = artifactUri(runId, stepId, result.taskKey, "metrics.json");
    entries.push({
      kind: "timings",
      uri: metricsUri,
      sha256: sha256(result.metrics),
      inline: { json: result.metrics }
    });

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

    const indexUri = artifactUri(runId, stepId, result.taskKey, "index.json");
    await insertArtifact(pool, runId, stepId, 0, {
      kind: "artifact_index",
      uri: indexUri,
      inline: { json: index },
      sha256: sha256(index)
    });

    let idx = 1;
    for (const entry of orderedEntries) {
      await insertArtifact(pool, runId, stepId, idx, {
        kind: entry.kind,
        uri: entry.uri,
        inline: entry.inline,
        sha256: entry.sha256
      });
      idx++;
    }
  }
}
