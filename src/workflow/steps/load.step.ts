import { getPool } from "../../db/pool";
import { findRunByWorkflowId } from "../../db/runRepo";
import { findIntentById } from "../../db/intentRepo";
import { assertIntent, type Intent } from "../../contracts/intent.schema";
import { assertRunBudget, type RunBudget } from "../../contracts/run-request.schema";
import { getConfig } from "../../config";

export type LoadOutput = {
  runId: string;
  intent: Intent;
  tenantId?: string;
  queuePartitionKey?: string;
  budget?: RunBudget;
  planApprovalTimeoutS: number;
};

export class LoadStepImpl {
  async execute(workflowId: string): Promise<LoadOutput> {
    const config = getConfig();
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

    if (run.budget !== null && run.budget !== undefined) {
      assertRunBudget(run.budget);
    }

    return {
      runId: run.id,
      intent,
      tenantId: run.tenant_id,
      queuePartitionKey: run.queue_partition_key,
      budget: run.budget ?? undefined,
      planApprovalTimeoutS: config.hitlPlanApprovalTimeoutS
    };
  }
}
