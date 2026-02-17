import { DBOS } from "@dbos-inc/dbos-sdk";
import { getPool } from "../../db/pool";
import { findRunByWorkflowId } from "../../db/runRepo";
import { findIntentById } from "../../db/intentRepo";
import { assertIntent } from "../../contracts/intent.schema";
import { IntentSteps } from "./intentSteps";

export class IntentWorkflow {
  @DBOS.workflow()
  static async run(workflowId: string) {
    const pool = getPool();

    // 1. Gate: DB-load pre-WF
    const run = await findRunByWorkflowId(pool, workflowId);
    if (!run) {
      throw new Error(`Run not found for workflowId: ${workflowId}`);
    }

    const intentRow = await findIntentById(pool, run.intent_id);
    if (!intentRow) {
      throw new Error(`Intent not found for id: ${run.intent_id}`);
    }

    // Validate Intent from DB before running
    const { goal, inputs, constraints, connectors } = intentRow;
    const intent = { goal, inputs, constraints, connectors };
    assertIntent(intent);

    // 2. Start run
    await IntentSteps.startRun(run.id);

    // 3. Run steps
    await IntentSteps.dummyOCStep(run.id);

    // 4. Finish run
    await IntentSteps.finishRun(run.id);
  }
}
