import { DBOS } from "@dbos-inc/dbos-sdk";
import type { WorkflowService, WorkflowOptions } from "./port";
import { CrashDemoWorkflow } from "./dbos/crashDemoWorkflow";
import { CrashDemoSteps } from "./dbos/steps";
import { IntentWorkflow } from "./dbos/intentWorkflow";

export class DBOSWorkflowEngine implements WorkflowService {
  constructor(private readonly sleepMs: number) {}

  async startIntentRun(workflowId: string, options?: WorkflowOptions): Promise<void> {
    const finalWorkflowId = options?.deduplicationID ?? workflowId;
    await DBOS.startWorkflow(IntentWorkflow.run, {
      workflowID: finalWorkflowId,
      queueName: options?.queueName,
      timeoutMS: options?.timeoutMS
    })(workflowId);
  }

  async startRepairRun(runId: string): Promise<void> {
    // Repair run gets a new workflow ID to avoid conflicts with the original one if it's terminally failed.
    // Or we use the runId itself if we want.
    const repairWorkflowId = `repair-${runId}`;
    await DBOS.startWorkflow(IntentWorkflow.repair, {
      workflowID: repairWorkflowId
    })(runId);
  }

  async sendEvent(workflowId: string, event: unknown): Promise<void> {
    // We send event to the workflow with specified ID.
    // If multiple runs share the same intentId (our default workflowId),
    // it will be sent to the one with that ID.
    await DBOS.send(workflowId, event, "human-event");
  }
  async startCrashDemo(workflowId: string): Promise<void> {
    await DBOS.startWorkflow(CrashDemoWorkflow.run, { workflowID: workflowId })(
      workflowId,
      this.sleepMs
    );
  }

  async marks(workflowId: string): Promise<Record<string, number>> {
    // Just call the step directly for read-only.
    // It will run in a temporary workflow.
    return await CrashDemoSteps.getMarks(workflowId);
  }

  async resumeIncomplete(): Promise<void> {
    // DBOS automatically resumes workflows if launch() is called.
  }

  async waitUntilComplete(workflowId: string, _timeoutMs?: number): Promise<void> {
    const handle = DBOS.retrieveWorkflow(workflowId);
    // getResult() waits for completion.
    await handle.getResult();
  }

  async destroy(): Promise<void> {
    // DBOS.shutdown is usually handled at the main level, but we could do it here
    // or just make this a no-op if handled globally.
  }
}
