import { getPool } from "../../db/pool";
import { findRunByWorkflowId } from "../../db/runRepo";
import { findIntentById } from "../../db/intentRepo";
import { assertIntent, type Intent } from "../../contracts/intent.schema";

export type LoadOutput = {
  runId: string;
  intent: Intent;
};

export class LoadStepImpl {
  async execute(workflowId: string): Promise<LoadOutput> {
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
    const intent: Intent = { goal, inputs, constraints, connectors };
    assertIntent(intent);

    return {
      runId: run.id,
      intent
    };
  }
}
