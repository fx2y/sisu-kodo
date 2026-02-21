import { DBOS } from "@dbos-inc/dbos-sdk";
import { insertArtifact } from "../../db/artifactRepo";
import { findRunByWorkflowId } from "../../db/runRepo";
import { getPool } from "../../db/pool";
import { buildArtifactUri } from "../../lib/artifact-uri";
import { sha256 } from "../../lib/hash";
import { nowIso } from "../../lib/time";

@DBOS.className("HITLEscalation")
export class HITLEscalation {
  @DBOS.workflow()
  static async EscalateTimeout(workflowId: string, gateKey: string) {
    await DBOS.runStep(async () => {
      const pool = getPool();
      const run = await findRunByWorkflowId(pool, workflowId);
      if (!run) {
        throw new Error(`Run not found for workflowId: ${workflowId}`);
      }
      const runId = run.id;
      const stepId = "EscalateTimeout";
      const taskKey = gateKey;
      const content = {
        event: "TIMEOUT_ESCALATION",
        gateKey,
        at: nowIso(),
        reason: "Human gate timed out"
      };

      await insertArtifact(
        pool,
        runId,
        stepId,
        999, // Sentinel idx
        {
          kind: "ops",
          uri: buildArtifactUri({ runId, stepId, taskKey, name: "escalation.json" }),
          inline: content,
          sha256: sha256(JSON.stringify(content))
        },
        taskKey,
        1
      );
    });
  }
}
