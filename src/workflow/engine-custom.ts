import type { Pool } from "pg";
import { performance } from "node:perf_hooks";

import { waitMs } from "../lib/time";
import type {
  WorkflowForkResult,
  WorkflowForkRequest,
  WorkflowOpsListQuery,
  WorkflowOpsSummary,
  WorkflowService,
  WorkflowOptions
} from "./port";

type Phase = "sleep_then_step2" | "done";

type WorkflowRow = {
  workflow_id: string;
  step1_done: boolean;
  step2_done: boolean;
  completed: boolean;
};

export class CustomWorkflowEngine implements WorkflowService {
  private readonly active = new Set<string>();

  public constructor(
    private readonly pool: Pool,
    private readonly sleepMs: number
  ) {}

  public async startIntentRun(_workflowId: string, _options?: WorkflowOptions): Promise<void> {
    throw new Error("Intent workflows not supported by CustomWorkflowEngine");
  }

  public async startRepairRun(_runId: string): Promise<void> {
    throw new Error("Repair workflows not supported by CustomWorkflowEngine");
  }

  public async sendEvent(_workflowId: string, _event: unknown): Promise<void> {
    throw new Error("Events not supported by CustomWorkflowEngine");
  }

  public async startCrashDemo(workflowId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO app.workflow_runs (workflow_id) VALUES ($1) ON CONFLICT (workflow_id) DO NOTHING`,
      [workflowId]
    );
    this.schedule(workflowId);
  }

  public async resumeIncomplete(): Promise<void> {
    const result = await this.pool.query<{ workflow_id: string }>(
      `SELECT workflow_id FROM app.workflow_runs WHERE completed = FALSE`
    );
    for (const row of result.rows) {
      this.schedule(row.workflow_id);
    }
  }

  public async waitUntilComplete(workflowId: string, timeoutMs = 10_000): Promise<void> {
    const startedMs = performance.now();
    for (;;) {
      const row = await this.pool.query<{ completed: boolean }>(
        `SELECT completed FROM app.workflow_runs WHERE workflow_id = $1`,
        [workflowId]
      );
      if (row.rows[0]?.completed) return;
      const elapsedMs = performance.now() - startedMs;
      if (elapsedMs > timeoutMs) {
        throw new Error(`workflow ${workflowId} did not complete in ${timeoutMs}ms`);
      }
      await waitMs(20);
    }
  }

  public async marks(workflowId: string): Promise<Record<string, number>> {
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

  public async getWorkflowStatus(workflowId: string): Promise<string | undefined> {
    const row = await this.pool.query<{ completed: boolean }>(
      `SELECT completed FROM app.workflow_runs WHERE workflow_id = $1`,
      [workflowId]
    );
    if (row.rowCount === 0) return undefined;
    return row.rows[0].completed ? "SUCCESS" : "PENDING";
  }

  public async listWorkflowSteps(_workflowId: string) {
    return [];
  }

  public async cancelWorkflow(_workflowId: string): Promise<void> {
    throw new Error("Cancel not supported by CustomWorkflowEngine");
  }

  public async resumeWorkflow(_workflowId: string): Promise<void> {
    throw new Error("Resume not supported by CustomWorkflowEngine");
  }

  public async forkWorkflow(
    _workflowId: string,
    _request: WorkflowForkRequest
  ): Promise<WorkflowForkResult> {
    throw new Error("Fork not supported by CustomWorkflowEngine");
  }

  public async listWorkflows(_query: WorkflowOpsListQuery): Promise<WorkflowOpsSummary[]> {
    throw new Error("List not supported by CustomWorkflowEngine");
  }

  public async getWorkflow(_workflowId: string): Promise<WorkflowOpsSummary | undefined> {
    throw new Error("Get not supported by CustomWorkflowEngine");
  }

  private schedule(workflowId: string): void {
    if (this.active.has(workflowId)) return;
    this.active.add(workflowId);
    void this.run(workflowId).finally(() => {
      this.active.delete(workflowId);
    });
  }

  private async run(workflowId: string): Promise<void> {
    const phase = await this.takePhase(workflowId);
    if (phase === "done") return;

    await waitMs(this.sleepMs);
    await this.pool.query(
      `
      INSERT INTO app.marks (run_id, step)
      VALUES ($1, 's2')
      ON CONFLICT (run_id, step) DO NOTHING
    `,
      [workflowId]
    );

    await this.pool.query(
      `
      UPDATE app.workflow_runs
      SET step2_done = TRUE,
          completed = TRUE,
          updated_at = NOW()
      WHERE workflow_id = $1
    `,
      [workflowId]
    );
  }

  private async takePhase(workflowId: string): Promise<Phase> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<WorkflowRow>(
        `
        SELECT workflow_id, step1_done, step2_done, completed
        FROM app.workflow_runs
        WHERE workflow_id = $1
        FOR UPDATE
      `,
        [workflowId]
      );

      if (current.rowCount === 0) {
        await client.query(`INSERT INTO app.workflow_runs (workflow_id) VALUES ($1)`, [workflowId]);
      }

      const row = current.rows[0] ?? {
        workflow_id: workflowId,
        step1_done: false,
        step2_done: false,
        completed: false
      };

      if (!row.step1_done) {
        await client.query(
          `INSERT INTO app.marks (run_id, step) VALUES ($1, 's1') ON CONFLICT (run_id, step) DO NOTHING`,
          [workflowId]
        );
        await client.query(
          `
          UPDATE app.workflow_runs
          SET step1_done = TRUE,
              updated_at = NOW()
          WHERE workflow_id = $1
        `,
          [workflowId]
        );
        await client.query("COMMIT");
        return "sleep_then_step2";
      }

      if (!row.step2_done) {
        await client.query("COMMIT");
        return "sleep_then_step2";
      }

      await client.query("COMMIT");
      return "done";
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async destroy(): Promise<void> {
    // no-op
  }
}
