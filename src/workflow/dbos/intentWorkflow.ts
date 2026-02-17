import { DBOS } from "@dbos-inc/dbos-sdk";
import { runIntentWorkflow } from "../wf/run-intent.wf";
import type { IntentWorkflowSteps } from "../wf/run-intent.wf";
import { IntentSteps } from "./intentSteps";

export class IntentWorkflow {
  @DBOS.workflow()
  static async run(workflowId: string) {
    const steps: IntentWorkflowSteps = {
      loadContext: (id) => IntentSteps.loadContext(id),
      startRun: (id) => IntentSteps.startRun(id),
      dummyOCStep: (id) => IntentSteps.dummyOCStep(id),
      finishRun: (id) => IntentSteps.finishRun(id)
    };

    await runIntentWorkflow(steps, workflowId);
  }
}
