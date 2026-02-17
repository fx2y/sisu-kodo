import { DBOS } from "@dbos-inc/dbos-sdk";
import { getPool } from "../../db/pool";
import { insertRunStep, updateRunStatus } from "../../db/runRepo";
import { assertOCOutput } from "../../oc/schema";
import type { OCOutput } from "../../oc/schema";
import { nowIso } from "../../lib/time";

export class IntentSteps {
  @DBOS.step()
  static async startRun(runId: string) {
    const pool = getPool();
    await updateRunStatus(pool, runId, "running");
  }

  @DBOS.step()
  static async finishRun(runId: string) {
    const pool = getPool();
    await updateRunStatus(pool, runId, "succeeded");
  }

  @DBOS.step()
  static async dummyOCStep(runId: string): Promise<OCOutput> {
    const pool = getPool();

    // Gate: "step-output" gate
    const output: OCOutput = {
      prompt: "dummy prompt",
      toolcalls: [{ name: "bash", args: { cmd: "ls" } }],
      responses: ["file.txt"],
      diffs: []
    };

    assertOCOutput(output);

    await insertRunStep(pool, runId, {
      stepId: "step1",
      phase: "planning",
      output: output,
      startedAt: nowIso(),
      finishedAt: nowIso()
    });

    return output;
  }
}
