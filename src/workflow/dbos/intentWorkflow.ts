import { DBOS } from "@dbos-inc/dbos-sdk";
import { runIntentWorkflow, repairRunWorkflow } from "../wf/run-intent.wf";
import type { IntentWorkflowSteps } from "../wf/run-intent.wf";
import { IntentSteps } from "./intentSteps";
import "./queues";

export class IntentWorkflow {
  @DBOS.workflow({ maxRecoveryAttempts: 3 })
  static async run(workflowId: string) {
    const steps: IntentWorkflowSteps = {
      load: (id) => IntentSteps.load(id),
      compile: (runId, intent) => IntentSteps.compile(runId, intent),
      applyPatch: (runId, compiled) => IntentSteps.applyPatch(runId, compiled),
      decide: (runId, patched) => IntentSteps.decide(runId, patched),
      execute: (runId, decision) => IntentSteps.execute(runId, decision),
      saveArtifacts: (runId, stepId, result) => IntentSteps.saveArtifacts(runId, stepId, result),
      updateStatus: (runId, status) => IntentSteps.updateStatus(runId, status),
      updateOps: async (runId, ops) => {
        // Use impure for retry count to ensure it runs on every retry
        return IntentSteps.updateOpsImpure(runId, ops);
      },
      getRun: (runId) => IntentSteps.getRun(runId),
      getRunSteps: (runId) => IntentSteps.getRunSteps(runId),
      emitQuestion: (runId, question) => IntentSteps.emitQuestion(runId, question),
      waitForEvent: (_workflowId) => DBOS.recv("human-event", 300)
    };

    await runIntentWorkflow(steps, workflowId);
  }

  @DBOS.workflow({ maxRecoveryAttempts: 3 })
  static async repair(runId: string) {
    const steps: IntentWorkflowSteps = {
      load: (id) => IntentSteps.load(id),
      compile: (runId, intent) => IntentSteps.compile(runId, intent),
      applyPatch: (runId, compiled) => IntentSteps.applyPatch(runId, compiled),
      decide: (runId, patched) => IntentSteps.decide(runId, patched),
      execute: (runId, decision) => IntentSteps.execute(runId, decision),
      saveArtifacts: (runId, stepId, result) => IntentSteps.saveArtifacts(runId, stepId, result),
      updateStatus: (runId, status) => IntentSteps.updateStatus(runId, status),
      updateOps: async (runId, ops) => {
        // Use impure for retry count to ensure it runs on every retry
        return IntentSteps.updateOpsImpure(runId, ops);
      },
      getRun: (runId) => IntentSteps.getRun(runId),
      getRunSteps: (runId) => IntentSteps.getRunSteps(runId),
      emitQuestion: (runId, question) => IntentSteps.emitQuestion(runId, question),
      waitForEvent: (_workflowId) => DBOS.recv("human-event", 300)
    };

    await repairRunWorkflow(steps, runId);
  }
}
