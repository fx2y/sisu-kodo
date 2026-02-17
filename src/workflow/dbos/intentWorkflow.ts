import { DBOS } from "@dbos-inc/dbos-sdk";
import { runIntentWorkflow } from "../wf/run-intent.wf";
import type { IntentWorkflowSteps } from "../wf/run-intent.wf";
import { IntentSteps } from "./intentSteps";

export class IntentWorkflow {
  @DBOS.workflow()
  static async run(workflowId: string) {
    const steps: IntentWorkflowSteps = {
      load: (id) => IntentSteps.load(id),
      compile: (runId, intent) => IntentSteps.compile(runId, intent),
      applyPatch: (runId, compiled) => IntentSteps.applyPatch(runId, compiled),
      decide: (runId, patched) => IntentSteps.decide(runId, patched),
      execute: (runId, decision) => IntentSteps.execute(runId, decision),
      saveArtifacts: (runId, stepId, result) => IntentSteps.saveArtifacts(runId, stepId, result),
      updateStatus: (runId, status) => IntentSteps.updateStatus(runId, status)
    };

    await runIntentWorkflow(steps, workflowId);
  }
}
