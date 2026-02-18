import { DBOS } from "@dbos-inc/dbos-sdk";
import type { WorkflowService, WorkflowOptions } from "./port";
import { CrashDemoWorkflow } from "./dbos/crashDemoWorkflow";
import { CrashDemoSteps } from "./dbos/steps";
import { IntentWorkflow } from "./dbos/intentWorkflow";

export class DBOSWorkflowEngine implements WorkflowService {
  constructor(private readonly sleepMs: number) {}

  async startIntentRun(workflowId: string, options?: WorkflowOptions): Promise<void> {
    await DBOS.startWorkflow(IntentWorkflow.run, {
      workflowID: workflowId,
      queueName: options?.queueName ?? "intentQ",
      timeoutMS: options?.timeoutMS,
      enqueueOptions: {
        deduplicationID: options?.deduplicationID,
        priority: options?.priority
      }
    })(workflowId);
  }

  async startRepairRun(runId: string): Promise<void> {
    const repairWorkflowId = `repair-${runId}`;
    await DBOS.startWorkflow(IntentWorkflow.repair, {
      workflowID: repairWorkflowId,
      queueName: "controlQ"
    })(runId);
  }

  async sendEvent(workflowId: string, event: unknown): Promise<void> {
    await DBOS.send(workflowId, event, "human-event");
  }

  async startCrashDemo(workflowId: string): Promise<void> {
    await DBOS.startWorkflow(CrashDemoWorkflow.run, {
      workflowID: workflowId,
      queueName: "controlQ"
    })(workflowId, this.sleepMs);
  }

  async marks(workflowId: string): Promise<Record<string, number>> {
    return await CrashDemoSteps.getMarks(workflowId);
  }

  async resumeIncomplete(): Promise<void> {}

  async waitUntilComplete(workflowId: string, _timeoutMs?: number): Promise<void> {
    const handle = DBOS.retrieveWorkflow(workflowId);
    await handle.getResult();
  }

  async destroy(): Promise<void> {}
}
