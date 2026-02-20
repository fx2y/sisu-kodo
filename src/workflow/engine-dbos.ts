import { DBOS } from "@dbos-inc/dbos-sdk";
import type {
  WorkflowForkRequest,
  WorkflowOpsListQuery,
  WorkflowOpsSummary,
  WorkflowService,
  WorkflowOptions
} from "./port";
import { CrashDemoWorkflow } from "./dbos/crashDemoWorkflow";
import { CrashDemoSteps } from "./dbos/steps";
import { IntentWorkflow } from "./dbos/intentWorkflow";
import { initQueues } from "./dbos/queues";
import { toWorkflowListInput, toWorkflowOpsStep, toWorkflowOpsSummary } from "./ops-mapper";

export class DBOSWorkflowEngine implements WorkflowService {
  constructor(private readonly sleepMs: number) {
    initQueues();
  }

  async startIntentRun(workflowId: string, options?: WorkflowOptions): Promise<void> {
    await DBOS.startWorkflow(IntentWorkflow.run, {
      workflowID: workflowId,
      queueName: options?.queueName ?? "intentQ",
      timeoutMS: options?.timeoutMS,
      enqueueOptions: {
        deduplicationID: options?.deduplicationID,
        priority: options?.priority,
        queuePartitionKey: options?.queuePartitionKey
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

  async getWorkflowStatus(workflowId: string): Promise<string | undefined> {
    const status = await DBOS.getWorkflowStatus(workflowId);
    return status?.status;
  }

  async listWorkflowSteps(workflowId: string) {
    const steps = await DBOS.listWorkflowSteps(workflowId);
    return (steps ?? []).map(toWorkflowOpsStep);
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    await DBOS.cancelWorkflow(workflowId);
  }

  async resumeWorkflow(workflowId: string): Promise<void> {
    await DBOS.resumeWorkflow(workflowId);
  }

  async forkWorkflow(workflowId: string, request: WorkflowForkRequest) {
    const handle = await DBOS.forkWorkflow(workflowId, request.stepN, {
      applicationVersion: request.appVersion
    });
    return { workflowID: handle.workflowID };
  }

  async listWorkflows(query: WorkflowOpsListQuery): Promise<WorkflowOpsSummary[]> {
    const workflows = await DBOS.listWorkflows(toWorkflowListInput(query));
    return workflows.map(toWorkflowOpsSummary);
  }

  async getWorkflow(workflowId: string): Promise<WorkflowOpsSummary | undefined> {
    const status = await DBOS.getWorkflowStatus(workflowId);
    if (!status) {
      return undefined;
    }
    return toWorkflowOpsSummary(status);
  }

  async waitUntilComplete(workflowId: string, timeoutMs?: number): Promise<void> {
    const handle = DBOS.retrieveWorkflow(workflowId);
    if (!timeoutMs) {
      await handle.getResult();
      return;
    }

    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout waiting for workflow ${workflowId} after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    await Promise.race([handle.getResult(), timeoutPromise]);
  }

  async destroy(): Promise<void> {}
}
