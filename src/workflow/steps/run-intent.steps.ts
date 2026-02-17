import { getPool } from "../../db/pool";
import { findRunByWorkflowId, insertRunStep, updateRunStatus } from "../../db/runRepo";
import { findIntentById } from "../../db/intentRepo";
import { assertOCOutput } from "../../oc/schema";
import type { OCOutput } from "../../oc/schema";
import type { Intent } from "../../contracts/intent.schema";
import { nowIso } from "../../lib/time";

export type { OCOutput, Intent };

export class RunIntentStepsImpl {
  async loadContext(workflowId: string): Promise<{ runId: string; intent: Intent }> {
    const pool = getPool();
    const run = await findRunByWorkflowId(pool, workflowId);
    if (!run) {
      throw new Error(`Run not found for workflowId: ${workflowId}`);
    }

    const intentRow = await findIntentById(pool, run.intent_id);
    if (!intentRow) {
      throw new Error(`Intent not found for id: ${run.intent_id}`);
    }

    const { goal, inputs, constraints, connectors } = intentRow;
    return {
      runId: run.id,
      intent: { goal, inputs, constraints, connectors }
    };
  }

  async startRun(runId: string): Promise<void> {
    const pool = getPool();
    await updateRunStatus(pool, runId, "running");
  }

  async finishRun(runId: string): Promise<void> {
    const pool = getPool();
    await updateRunStatus(pool, runId, "succeeded");
  }

  async dummyOCStep(runId: string): Promise<OCOutput> {
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
