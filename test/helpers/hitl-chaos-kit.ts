import { DBOS } from "@dbos-inc/dbos-sdk";
import { insertIntent } from "../../src/db/intentRepo";
import { findHumanGate, findLatestGateByRunId, type HumanGate } from "../../src/db/humanGateRepo";
import { generateId } from "../../src/lib/id";
import { toHumanTopic } from "../../src/lib/hitl-topic";
import { findRunById, type RunRow } from "../../src/db/runRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { toHitlPromptKey } from "../../src/workflow/hitl/keys";
import type { TestLifecycle } from "../integration/lifecycle";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_MS = 200;

type WaitOptions = {
  timeoutMs?: number;
  pollMs?: number;
};

async function waitFor<T>(
  fetcher: () => Promise<T | null>,
  label: string,
  options: WaitOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const startMs = Date.now();
  while (Date.now() - startMs <= timeoutMs) {
    const value = await fetcher();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

function toEscalationWorkflowId(workflowId: string, gateKey: string): string {
  return `esc:${workflowId}:${gateKey}`;
}

export class HITLChaosKit {
  constructor(private readonly lc: TestLifecycle) {}

  async spawnRun(
    intentGoal: string,
    inputs: Record<string, unknown> = {},
    constraints: Record<string, unknown> = {},
    queuePartitionKey = "chaos-partition"
  ): Promise<{ runId: string; intentId: string }> {
    const intentId = generateId("it_chaos");
    await insertIntent(this.lc.pool, intentId, {
      goal: intentGoal,
      inputs,
      constraints
    });
    const { runId } = await startIntentRun(this.lc.pool, this.lc.workflow, intentId, {
      queuePartitionKey
    });
    return { runId, intentId };
  }

  async killWorker(): Promise<void> {
    await DBOS.shutdown();
  }

  async restartWorker(): Promise<void> {
    await DBOS.launch();
  }

  async waitForGate(runId: string, options?: WaitOptions): Promise<HumanGate> {
    return waitFor(
      () => findLatestGateByRunId(this.lc.pool, runId),
      `latest gate for run ${runId}`,
      options
    );
  }

  async waitForGateKey(runId: string, gateKey: string, options?: WaitOptions): Promise<HumanGate> {
    return waitFor(
      () => findHumanGate(this.lc.pool, runId, gateKey),
      `gate ${gateKey} for run ${runId}`,
      options
    );
  }

  async waitForRunStatus(
    runId: string,
    targetStatus: RunRow["status"],
    options?: WaitOptions
  ): Promise<RunRow> {
    return waitFor(
      async () => {
        const run = await findRunById(this.lc.pool, runId);
        if (!run) return null;
        return run.status === targetStatus ? run : null;
      },
      `run ${runId} status ${targetStatus}`,
      options
    );
  }

  async waitForWorkflowStatus(
    workflowId: string,
    targetStatus: string | string[],
    options?: WaitOptions
  ): Promise<string> {
    const targets = new Set(Array.isArray(targetStatus) ? targetStatus : [targetStatus]);
    return waitFor(
      async () => {
        const status = await this.lc.workflow.getWorkflowStatus(workflowId);
        if (!status) return null;
        return targets.has(status) ? status : null;
      },
      `workflow ${workflowId} status in [${Array.from(targets).join(", ")}]`,
      options
    );
  }

  async getRun(runId: string): Promise<RunRow> {
    const run = await findRunById(this.lc.pool, runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }

  async getEventOrThrow<T>(workflowId: string, key: string, timeoutS = 20): Promise<T> {
    const value = await this.lc.workflow.getEvent<T>(workflowId, key, timeoutS);
    if (value === null) {
      throw new Error(`Timed out waiting for event ${key} on workflow ${workflowId}`);
    }
    return value;
  }

  async waitForEvent<T>(workflowId: string, key: string, options?: WaitOptions): Promise<T> {
    return waitFor(
      async () => {
        const value = await this.lc.workflow.getEvent<T>(workflowId, key, 0.1);
        return value === null ? null : value;
      },
      `event ${key} on workflow ${workflowId}`,
      options
    );
  }

  async sendReply(
    workflowId: string,
    gateKey: string,
    payload: Record<string, unknown>,
    dedupeKey: string
  ): Promise<void> {
    await this.lc.workflow.sendMessage(workflowId, payload, toHumanTopic(gateKey), dedupeKey);
  }

  async sendReplyOnTopic(
    workflowId: string,
    topic: string,
    payload: Record<string, unknown>,
    dedupeKey: string
  ): Promise<void> {
    await this.lc.workflow.sendMessage(workflowId, payload, topic, dedupeKey);
  }

  async countPromptEvents(workflowId: string, gateKey: string): Promise<number> {
    const promptKey = toHitlPromptKey(gateKey);
    const res = await this.lc.sysPool.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM dbos.workflow_events WHERE workflow_uuid = $1 AND key = $2",
      [workflowId, promptKey]
    );
    return Number(res.rows[0]?.c ?? "0");
  }

  async assertNoPhantomPrompt(workflowId: string, gateKey: string): Promise<void> {
    const count = await this.countPromptEvents(workflowId, gateKey);
    if (count !== 1) {
      throw new Error(
        `Expected exactly one prompt event for workflow ${workflowId} gate ${gateKey}; got ${count}`
      );
    }
  }

  async countInteractionRows(
    workflowId: string,
    opts: { gateKey?: string; dedupeKey?: string } = {}
  ): Promise<number> {
    const clauses = ["workflow_id = $1"];
    const params: unknown[] = [workflowId];
    if (opts.gateKey) {
      params.push(opts.gateKey);
      clauses.push(`gate_key = $${params.length}`);
    }
    if (opts.dedupeKey) {
      params.push(opts.dedupeKey);
      clauses.push(`dedupe_key = $${params.length}`);
    }
    const sql = `SELECT COUNT(*)::text AS c FROM app.human_interactions WHERE ${clauses.join(" AND ")}`;
    const res = await this.lc.pool.query<{ c: string }>(sql, params);
    return Number(res.rows[0]?.c ?? "0");
  }

  async countArtifacts(runId: string): Promise<number> {
    const res = await this.lc.pool.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM app.artifacts WHERE run_id = $1",
      [runId]
    );
    return Number(res.rows[0]?.c ?? "0");
  }

  async countEscalationRows(workflowId: string, gateKey: string): Promise<number> {
    const res = await this.lc.sysPool.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM dbos.workflow_status WHERE workflow_uuid = $1 AND status = 'SUCCESS'",
      [toEscalationWorkflowId(workflowId, gateKey)]
    );
    return Number(res.rows[0]?.c ?? "0");
  }

  async waitForEscalationSuccess(
    workflowId: string,
    gateKey: string,
    options?: WaitOptions
  ): Promise<void> {
    await waitFor(
      async () => {
        const rows = await this.countEscalationRows(workflowId, gateKey);
        return rows > 0 ? true : null;
      },
      `escalation success for ${workflowId}:${gateKey}`,
      options
    );
  }

  async getRecoveryAttempts(workflowId: string): Promise<number> {
    const res = await this.lc.sysPool.query<{ recovery_attempts: string }>(
      "SELECT recovery_attempts::text FROM dbos.workflow_status WHERE workflow_uuid = $1",
      [workflowId]
    );
    return Number(res.rows[0]?.recovery_attempts ?? "0");
  }

  async assertTimelineIncludes(runId: string, expectedSteps: string[]): Promise<void> {
    const res = await this.lc.pool.query<{ step_id: string }>(
      "SELECT DISTINCT step_id FROM app.run_steps WHERE run_id = $1",
      [runId]
    );
    const actual = new Set(res.rows.map((row) => row.step_id));
    const missing = expectedSteps.filter((step) => !actual.has(step));
    if (missing.length > 0) {
      throw new Error(
        `Run ${runId} missing expected steps [${missing.join(", ")}]; actual=[${Array.from(actual).join(", ")}]`
      );
    }
  }
}
