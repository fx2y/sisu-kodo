import { getPool } from "../../db/pool";
import { insertArtifact } from "../../db/artifactRepo";
import type { ExecutionResult } from "./execute.step";
import type { ArtifactRef } from "../../contracts/artifact-ref.schema";
import { sha256 } from "../../lib/hash";

export class SaveArtifactsStepImpl {
  async execute(runId: string, stepId: string, result: ExecutionResult): Promise<void> {
    const pool = getPool();
    let idx = 0;

    // Save stdout as an artifact
    const stdoutArtifact: ArtifactRef = {
      kind: "text",
      uri: `runs/${runId}/steps/${stepId}/stdout.log`,
      inline: { text: result.stdout },
      sha256: sha256(result.stdout)
    };

    await insertArtifact(pool, runId, stepId, idx++, stdoutArtifact);

    // Save each file in result.filesOut
    for (const file of result.filesOut) {
      const fileArtifact: ArtifactRef = {
        kind: "file",
        uri: `runs/${runId}/steps/${stepId}/task/${result.taskKey}/${file.path}`,
        inline: file.inline ? { text: file.inline } : undefined,
        sha256: file.sha256
      };
      await insertArtifact(pool, runId, stepId, idx++, fileArtifact);
    }
  }
}
