import { DBOS } from "@dbos-inc/dbos-sdk";
import { runIntentWorkflow, repairRunWorkflow } from "../wf/run-intent.wf";
import type { IntentWorkflowSteps } from "../wf/run-intent.wf";
import { IntentSteps } from "./intentSteps";
import "./queues";
import type { Decision } from "../steps/decide.step";
import type { ExecutionResult } from "../steps/execute.step";
import type { SBXReq } from "../../contracts/index";

export class IntentWorkflow {
  @DBOS.workflow({ maxRecoveryAttempts: 3 })
  static async run(workflowId: string) {
    const steps: IntentWorkflowSteps = {
      load: (id) => IntentSteps.load(id),
      compile: (runId, intent) => IntentSteps.compile(runId, intent),
      applyPatch: (runId, compiled) => IntentSteps.applyPatch(runId, compiled),
      decide: (runId, patched) => IntentSteps.decide(runId, patched),
      buildTasks: (decision, ctx) => IntentSteps.buildTasks(decision, ctx),
      startTask: async (task: SBXReq, runId: string, queuePartitionKey?: string) => {
        try {
          return await DBOS.startWorkflow(IntentWorkflow.taskWorkflow, {
            workflowID: task.taskKey,
            queueName: "sbxQ",
            enqueueOptions: {
              queuePartitionKey
            }
          })(task, runId);
        } catch (e: any) {
          // DBOS throws error if workflowID already exists
          if (e.message?.includes("already exists")) {
            return DBOS.retrieveWorkflow(task.taskKey);
          }
          throw e;
        }
      },
      saveExecuteStep: (runId, result) => IntentSteps.saveExecuteStep(runId, result),
      executeTask: (req: SBXReq, runId: string) => IntentSteps.executeTask(req, runId),
      saveArtifacts: (runId, stepId, result) => IntentSteps.saveArtifacts(runId, stepId, result),
      updateStatus: (runId, status) => IntentSteps.updateStatus(runId, status),
      updateOps: (runId, ops) => IntentSteps.updateOps(runId, ops),
      isPlanApproved: (runId) => IntentSteps.isPlanApproved(runId),
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
      buildTasks: (decision, ctx) => IntentSteps.buildTasks(decision, ctx),
      startTask: async (task: SBXReq, runId: string, queuePartitionKey?: string) => {
        try {
          return await DBOS.startWorkflow(IntentWorkflow.taskWorkflow, {
            workflowID: task.taskKey,
            queueName: "sbxQ",
            enqueueOptions: {
              queuePartitionKey
            }
          })(task, runId);
        } catch (e: any) {
          // DBOS throws error if workflowID already exists
          if (e.message?.includes("already exists")) {
            return DBOS.retrieveWorkflow(task.taskKey);
          }
          throw e;
        }
      },
      saveExecuteStep: (runId, result) => IntentSteps.saveExecuteStep(runId, result),
      executeTask: (req: SBXReq, runId: string) => IntentSteps.executeTask(req, runId),
      saveArtifacts: (runId, stepId, result) => IntentSteps.saveArtifacts(runId, stepId, result),
      updateStatus: (runId, status) => IntentSteps.updateStatus(runId, status),
      updateOps: (runId, ops) => IntentSteps.updateOps(runId, ops),
      isPlanApproved: (runId) => IntentSteps.isPlanApproved(runId),
      getRun: (runId) => IntentSteps.getRun(runId),
      getRunSteps: (runId) => IntentSteps.getRunSteps(runId),
      emitQuestion: (runId, question) => IntentSteps.emitQuestion(runId, question),
      waitForEvent: (_workflowId) => DBOS.recv("human-event", 300)
    };

    await repairRunWorkflow(steps, runId);
  }

  @DBOS.workflow()
  static async taskWorkflow(req: SBXReq, runId: string) {
    return await IntentSteps.executeTask(req, runId);
  }
}
