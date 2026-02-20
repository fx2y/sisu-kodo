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
import { SlowStepWorkflow, SlowStepSteps } from "./dbos/slowStepWorkflow";
import { TimeWorkflow } from "./dbos/timeWorkflow";
import { initQueues } from "./dbos/queues";
import { toWorkflowListInput, toWorkflowOpsStep, toWorkflowOpsSummary } from "./ops-mapper";
import { LEGACY_HITL_TOPIC } from "../lib/hitl-topic";
import { getPool } from "../db/pool";
import { findRunByWorkflowId } from "../db/runRepo";
import { findLatestGateByRunId, insertHumanInteraction } from "../db/humanGateRepo";
import { sha256 } from "../lib/hash";
import { nowMs } from "../lib/time";

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

  async sendMessage(
    workflowId: string,
    message: unknown,
    topic: string,
    dedupeKey?: string
  ): Promise<void> {
    if (topic.startsWith("human:") && dedupeKey) {
      const gateKey = topic.substring(6);
      await insertHumanInteraction(getPool(), {
        workflowId,
        gateKey,
        topic,
        dedupeKey,
        payloadHash: sha256(JSON.stringify(message)),
        payload: message
      });
    }
    await DBOS.send(workflowId, message, topic, dedupeKey);
  }

  async getEvent<T>(workflowId: string, key: string, timeoutS = 60): Promise<T | null> {
    return await DBOS.getEvent<T>(workflowId, key, timeoutS);
  }

  async setEvent<T>(_workflowId: string, _key: string, _value: T): Promise<void> {
    throw new Error("setEvent is only supported from DBOS workflow context");
  }

  readStream<T>(workflowId: string, key: string): AsyncIterable<T> {
    return DBOS.readStream<T>(workflowId, key);
  }

  async writeStream<T>(_workflowId: string, key: string, chunk: T): Promise<void> {
    await DBOS.writeStream(key, chunk);
  }

  async closeStream(_workflowId: string, key: string): Promise<void> {
    await DBOS.closeStream(key);
  }

  async sendEvent(workflowId: string, event: unknown): Promise<void> {
    const pool = getPool();
    const run = await findRunByWorkflowId(pool, workflowId);
    let topic = LEGACY_HITL_TOPIC;
    let message = event;

    if (run) {
      const latestGate = await findLatestGateByRunId(pool, run.id);
      if (latestGate) {
        topic = latestGate.topic;
        // Map legacy approve-plan event to the format expected by awaitHuman
        if (
          typeof event === "object" &&
          event !== null &&
          (event as Record<string, unknown>).type === "approve-plan"
        ) {
          message = { approved: true, ...((event as Record<string, unknown>).payload as object) };
        }
      }
    }

    const dedupeKey = `legacy-event-${workflowId}-${nowMs()}`;
    await this.sendMessage(workflowId, message, topic, dedupeKey);
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

  async startSlowStep(workflowId: string, step1SleepMs: number): Promise<void> {
    await DBOS.startWorkflow(SlowStepWorkflow.run, {
      workflowID: workflowId,
      queueName: "controlQ"
    })(workflowId, step1SleepMs);
  }

  async getSlowMarks(workflowId: string): Promise<Record<string, number>> {
    return SlowStepSteps.getMarks(workflowId);
  }

  async startSleepWorkflow(workflowId: string, sleepMs: number): Promise<void> {
    await DBOS.startWorkflow(TimeWorkflow.sleepWorkflow, {
      workflowID: workflowId,
      queueName: "controlQ"
    })(workflowId, sleepMs);
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
