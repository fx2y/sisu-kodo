import { getPool } from "../../db/pool";
import { insertArtifact } from "../../db/artifactRepo";
import type { ExecutionResult } from "./execute.step";
import type { ArtifactRef } from "../../contracts/artifact-ref.schema";

export class SaveArtifactsStepImpl {
  async execute(runId: string, stepId: string, result: ExecutionResult): Promise<void> {
    const pool = getPool();
    let idx = 0;

    // Save stdout as an artifact
    const stdoutArtifact: ArtifactRef = {
      kind: "text",
      uri: `runs/${runId}/steps/${stepId}/stdout.log`,
      inline: { text: result.stdout },
      sha256: "dummy-sha256"
    };

    await insertArtifact(pool, runId, stepId, idx++, stdoutArtifact);

    // Save each file in result.files
    for (const [filename, content] of Object.entries(result.files)) {
      const fileArtifact: ArtifactRef = {
        kind: "text",
        uri: `runs/${runId}/steps/${stepId}/${filename}`,
        inline: { text: content },
        sha256: "dummy-sha256"
      };
      await insertArtifact(pool, runId, stepId, idx++, fileArtifact);
    }
  }
}
