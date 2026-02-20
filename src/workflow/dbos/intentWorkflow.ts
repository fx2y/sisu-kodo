import { DBOS, DBOSWorkflowConflictError } from "@dbos-inc/dbos-sdk";
import { runIntentWorkflow, repairRunWorkflow } from "../wf/run-intent.wf";
import type { IntentWorkflowSteps } from "../wf/run-intent.wf";
import type { TaskHandle } from "../port";
import { IntentSteps } from "./intentSteps";
import { assertSBXRes } from "../../contracts";
import type { SBXReq, SBXRes } from "../../contracts/index";

type UnknownTaskHandle = {
  workflowID: string;
  getResult(): Promise<unknown>;
};

function toSBXTaskHandle(handle: UnknownTaskHandle): TaskHandle<SBXRes> {
  return {
    workflowID: handle.workflowID,
    getResult: async () => {
      const result = await handle.getResult();
      assertSBXRes(result);
      return result;
    }
  };
}

async function startTaskWorkflow(
  task: SBXReq,
  runId: string,
  queuePartitionKey?: string
): Promise<TaskHandle<SBXRes>> {
  try {
    const handle = await DBOS.startWorkflow(IntentWorkflow.taskWorkflow, {
      workflowID: task.taskKey,
      queueName: "sbxQ",
      enqueueOptions: {
        // C7.T3: Remove implicit fallback; parent should carry key from resolveQueuePolicy.
        queuePartitionKey
      }
    })(task, runId);
    return toSBXTaskHandle(handle);
  } catch (e: unknown) {
    // DBOS throws if workflowID already exists; retrieve existing handle for exactly-once fanout.
    if (e instanceof DBOSWorkflowConflictError) {
      return toSBXTaskHandle(DBOS.retrieveWorkflow(task.taskKey));
    }
    throw e;
  }
}

function buildIntentWorkflowSteps(): IntentWorkflowSteps {
  return {
    load: (id) => IntentSteps.load(id),
    compile: (runId, intent) => IntentSteps.compile(runId, intent),
    applyPatch: (runId, compiled) => IntentSteps.applyPatch(runId, compiled),
    decide: (runId, patched) => IntentSteps.decide(runId, patched),
    buildTasks: (decision, ctx) => IntentSteps.buildTasks(decision, ctx),
    startTask: (task: SBXReq, runId: string, queuePartitionKey?: string) =>
      startTaskWorkflow(task, runId, queuePartitionKey),
    saveExecuteStep: (runId, result, decision) =>
      IntentSteps.saveExecuteStep(runId, result, decision),
    executeTask: (req: SBXReq, runId: string) => IntentSteps.executeTask(req, runId),
    saveArtifacts: (runId, stepId, result) => IntentSteps.saveArtifacts(runId, stepId, result),
    updateStatus: (runId, status) => IntentSteps.updateStatus(runId, status),
    updateOps: (runId, ops) => IntentSteps.updateOps(runId, ops),
    isPlanApproved: (runId) => IntentSteps.isPlanApproved(runId),
    getRun: (runId) => IntentSteps.getRun(runId),
    getRunSteps: (runId) => IntentSteps.getRunSteps(runId),
    emitQuestion: (runId, question) => IntentSteps.emitQuestion(runId, question),
    emitStatusEvent: (workflowId, status) => IntentSteps.emitStatusEvent(workflowId, status),
    streamChunk: (taskKey, kind, chunk, seq) => IntentSteps.streamChunk(taskKey, kind, chunk, seq),
    waitForEvent: (_workflowId) => DBOS.recv("human-event", 300)
  };
}

@DBOS.className("IntentWorkflow")
export class IntentWorkflow {
  @DBOS.workflow({ maxRecoveryAttempts: 3 })
  static async run(workflowId: string) {
    console.log(`[WORKFLOW] run starting for ${workflowId}`);
    await runIntentWorkflow(buildIntentWorkflowSteps(), workflowId);
  }

  @DBOS.workflow({ maxRecoveryAttempts: 3 })
  static async repair(runId: string) {
    await repairRunWorkflow(buildIntentWorkflowSteps(), runId);
  }

  @DBOS.workflow()
  static async taskWorkflow(req: SBXReq, runId: string) {
    return await IntentSteps.executeTask(req, runId);
  }
}
