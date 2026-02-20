import { DBOSClient } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import type { WorkflowService, WorkflowOptions } from "../workflow/port";

/**
 * WorkflowService implementation that uses DBOSClient to enqueue workflows
 * into a remote worker. It doesn't run workflows itself.
 */
export class DBOSClientWorkflowEngine implements WorkflowService {
  constructor(
    private readonly client: DBOSClient,
    private readonly pool: Pool,
    private readonly appVersion?: string
  ) {}

  static async create(
    systemDatabaseUrl: string,
    pool: Pool,
    appVersion?: string
  ): Promise<DBOSClientWorkflowEngine> {
    const client = await DBOSClient.create({ systemDatabaseUrl });
    return new DBOSClientWorkflowEngine(client, pool, appVersion);
  }

  async startIntentRun(workflowId: string, options?: WorkflowOptions): Promise<void> {
    await this.client.enqueue(
      {
        queueName: options?.queueName ?? "intentQ",
        workflowClassName: "IntentWorkflow",
        workflowName: "run",
        workflowID: workflowId,
        workflowTimeoutMS: options?.timeoutMS,
        deduplicationID: options?.deduplicationID,
        priority: options?.priority,
        queuePartitionKey: options?.queuePartitionKey,
        appVersion: this.appVersion
      },
      workflowId
    );
  }

  async startRepairRun(runId: string): Promise<void> {
    const repairWorkflowId = `repair-${runId}`;
    await this.client.enqueue(
      {
        queueName: "controlQ",
        workflowClassName: "IntentWorkflow",
        workflowName: "repair",
        workflowID: repairWorkflowId,
        appVersion: this.appVersion
      },
      runId
    );
  }

  async sendEvent(workflowId: string, event: unknown): Promise<void> {
    await this.client.send(workflowId, event, "human-event");
  }

  async startCrashDemo(workflowId: string): Promise<void> {
    await this.client.enqueue(
      {
        queueName: "controlQ",
        workflowClassName: "CrashDemoWorkflow",
        workflowName: "run",
        workflowID: workflowId,
        appVersion: this.appVersion
      },
      workflowId,
      5000
    );
  }

  async marks(workflowId: string): Promise<Record<string, number>> {
    // Ported from CrashDemoSteps.getMarks but for shim without worker
    const result = await this.pool.query<{ step: string; c: string }>(
      `SELECT step, COUNT(*)::text AS c FROM app.marks WHERE run_id = $1 GROUP BY step`,
      [workflowId]
    );
    const out: Record<string, number> = { s1: 0, s2: 0 };
    for (const row of result.rows) {
      out[row.step] = Number(row.c);
    }
    return out;
  }

  async resumeIncomplete(): Promise<void> {
    // API shim doesn't resume workflows.
  }

  async getWorkflowStatus(workflowId: string): Promise<string | undefined> {
    const handle = this.client.retrieveWorkflow(workflowId);
    const status = await handle.getStatus();
    return status?.status;
  }

  async listWorkflowSteps(workflowId: string): Promise<Array<{ stepId: string; status: string }>> {
    const steps = await this.client.listWorkflowSteps(workflowId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (steps ?? []).map((s: any) => ({
      stepId: s.name,
      status: s.completedAtEpochMs ? (s.error ? "FAILED" : "COMPLETED") : "RUNNING"
    }));
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    // TODO: implement true cancel
    console.warn("cancelWorkflow not implemented", workflowId);
  }

  async resumeWorkflow(workflowId: string): Promise<void> {
    // TODO: implement true resume
    console.warn("resumeWorkflow not implemented", workflowId);
  }

  async forkWorkflow(workflowId: string, _fromStep?: string): Promise<string> {
    // TODO: implement true fork
    console.warn("forkWorkflow not implemented", workflowId);
    return workflowId;
  }

  async listWorkflows(_query: unknown): Promise<unknown[]> {
    // TODO: implement list
    return [];
  }

  async getWorkflow(workflowId: string): Promise<unknown> {
    // TODO: implement get
    const handle = this.client.retrieveWorkflow(workflowId);
    return handle.getStatus();
  }

  async waitUntilComplete(workflowId: string, _timeoutMs?: number): Promise<void> {
    const handle = this.client.retrieveWorkflow(workflowId);
    await handle.getResult();
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
  }
}
