import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { execSync } from "node:child_process";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { generateId } from "../../src/lib/id";
import { waitForWorkflowStatus } from "../helpers/ops-fixtures";

// Deliberate failure workflow for testing ops kit
class FailWorkflow {
  @DBOS.step()
  static async failStep() {
    throw new Error("Deliberate failure");
  }

  @DBOS.workflow()
  static async run() {
    await FailWorkflow.failStep();
  }
}

let lc: TestLifecycle;

function runScript(command: string, input?: string): string {
  return execSync(command, { input, stdio: ["pipe", "pipe", "pipe"] }).toString();
}

function parseForkLine(output: string, workflowID: string): [string, string] {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${workflowID}\t`));
  if (!line) {
    throw new Error(`fork output missing workflow row for ${workflowID}: ${output}`);
  }
  const fields = line.split("\t");
  return [fields[0], fields[1] ?? ""];
}

async function waitForQueueDrain(workflowIDs: string[], timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await lc.sysPool.query<{ active: string }>(
      `SELECT COUNT(*)::text AS active
         FROM dbos.workflow_status
        WHERE workflow_uuid = ANY($1::text[])
          AND status IN ('ENQUEUED','PENDING')`,
      [workflowIDs]
    );
    if (Number(res.rows[0]?.active ?? "0") === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for queue drain of ${workflowIDs.length} workflows`);
}

async function latestOpsArtifact(
  workflowID: string
): Promise<{ op: string; actor?: string; reason?: string } | undefined> {
  const row = await lc.pool.query<{ payload: { op: string; actor?: string; reason?: string } }>(
    `SELECT a.inline AS payload
       FROM app.artifacts a
       JOIN app.runs r ON r.id = a.run_id
      WHERE a.step_id = 'OPS'
        AND r.workflow_id = $1
      ORDER BY a.created_at DESC
      LIMIT 1`,
    [workflowID]
  );
  return row.rows[0]?.payload;
}

beforeAll(async () => {
  lc = await setupLifecycle(10);
});

afterAll(async () => {
  await teardownLifecycle(lc);
});

describe("ops kit (Cycle C6)", () => {
  test("list_failed.sh returns failed workflows", async () => {
    const workflowID = generateId("it_fail");
    try {
      await DBOS.startWorkflow(FailWorkflow.run, { workflowID })();
    } catch {
      // expected
    }

    // Wait for DBOS to record the failure
    const status = await waitForWorkflowStatus(lc.workflow, workflowID, "ERROR", 10000);
    expect(status).toBe("ERROR");

    const output = runScript(`./scripts/ops/list_failed.sh 50`);
    expect(output).toContain(workflowID);
  });

  test("cancel_batch.sh cancels a pending/enqueued workflow", async () => {
    const workflowID = generateId("it_cancel_batch");
    await lc.workflow.startSlowStep(workflowID, 5000);

    // It can be ENQUEUED or PENDING
    const statusBefore = await lc.workflow.getWorkflowStatus(workflowID);
    expect(["ENQUEUED", "PENDING"]).toContain(statusBefore);

    runScript(`./scripts/ops/cancel_batch.sh`, `${workflowID}\n`);

    const statusAfter = await waitForWorkflowStatus(lc.workflow, workflowID, "CANCELLED", 5000);
    expect(statusAfter).toBe("CANCELLED");
    const artifact = await latestOpsArtifact(workflowID);
    expect(artifact?.op).toBe("cancel");
    expect(artifact?.actor).toBe("ops-batch");
    expect(artifact?.reason).toBe("batch-cancel");
  });

  test("resume_batch.sh resumes a cancelled workflow", async () => {
    const workflowID = generateId("it_resume_batch");
    await lc.workflow.startSlowStep(workflowID, 5000);
    await lc.workflow.cancelWorkflow(workflowID);

    await waitForWorkflowStatus(lc.workflow, workflowID, "CANCELLED", 5000);

    runScript(`./scripts/ops/resume_batch.sh`, `${workflowID}\n`);

    const statusAfter = await lc.workflow.getWorkflowStatus(workflowID);
    // It should move away from CANCELLED
    expect(["PENDING", "ENQUEUED", "SUCCESS"]).toContain(statusAfter);
    const artifact = await latestOpsArtifact(workflowID);
    expect(artifact?.op).toBe("resume");
    expect(artifact?.actor).toBe("ops-batch");
    expect(artifact?.reason).toBe("batch-resume");
  });

  test("fork_batch.sh forks a workflow", async () => {
    const workflowID = generateId("it_fork_base");
    await lc.workflow.startCrashDemo(workflowID);
    await lc.workflow.waitUntilComplete(workflowID, 5000);

    const steps = await lc.workflow.listWorkflowSteps(workflowID);
    const stepN = Math.max(1, ...steps.map((step) => step.functionId));

    const output = runScript(`./scripts/ops/fork_batch.sh ${stepN}`, `${workflowID}\n`);
    const [base, forked] = parseForkLine(output, workflowID);
    expect(base).toBe(workflowID);
    expect(forked.length).toBeGreaterThan(0);
    expect(forked).not.toBe(workflowID);
    const artifact = await latestOpsArtifact(workflowID);
    expect(artifact?.op).toBe("fork");
    expect(artifact?.actor).toBe("ops-batch");
    expect(artifact?.reason).toBe("batch-fork");
  });

  test("retry_from_step.sh replays from a validated step with actor/reason evidence", async () => {
    const workflowID = generateId("it_retry_from_step");
    await lc.workflow.startCrashDemo(workflowID);
    await lc.workflow.waitUntilComplete(workflowID, 5000);

    const steps = await lc.workflow.listWorkflowSteps(workflowID);
    const stepN = Math.max(1, ...steps.map((step) => step.functionId));

    const output = runScript(`./scripts/ops/retry_from_step.sh ${stepN}`, `${workflowID}\n`);
    const [base, forked] = parseForkLine(output, workflowID);
    expect(base).toBe(workflowID);
    expect(forked.length).toBeGreaterThan(0);
    expect(forked).not.toBe(workflowID);

    const artifact = await latestOpsArtifact(workflowID);
    expect(artifact?.op).toBe("fork");
    expect(artifact?.actor).toBe("ops-batch");
    expect(artifact?.reason).toBe("retry-from-step:batch-retry-from-step");
  });

  test("batch list ordering is deterministic and queue backlog drains after cancellation", async () => {
    const workflowIDs: string[] = [];
    for (let i = 0; i < 120; i += 1) {
      const workflowID = generateId(`it_ops_backlog_${String(i).padStart(3, "0")}`);
      workflowIDs.push(workflowID);
      await lc.workflow.startSlowStep(workflowID, 10000);
    }

    const first = runScript(
      "pnpm exec tsx scripts/ops/cli.ts list --status PENDING --status ENQUEUED --name run --limit 500 --format ids"
    );
    const second = runScript(
      "pnpm exec tsx scripts/ops/cli.ts list --status PENDING --status ENQUEUED --name run --limit 500 --format ids"
    );
    expect(first).toBe(second);

    runScript("./scripts/ops/cancel_batch.sh", `${workflowIDs.join("\n")}\n`);
    await waitForQueueDrain(workflowIDs, 15000);
    const active = await lc.sysPool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM dbos.workflow_status
        WHERE workflow_uuid = ANY($1::text[])
          AND status IN ('ENQUEUED','PENDING')`,
      [workflowIDs]
    );
    expect(Number(active.rows[0]?.c ?? "0")).toBe(0);
  }, 30000);

  test("SQL views return expected columns", async () => {
    // Recent failures
    const failures = runScript(
      `scripts/db/psql-sys.sh -c "SELECT * FROM app.v_ops_failures_24h LIMIT 1"`
    );
    expect(failures).toContain("workflow_uuid");
    expect(failures).toContain("status");

    // Queue depth
    const queues = runScript(`scripts/db/psql-sys.sh -c "SELECT * FROM app.v_ops_queue_depth"`);
    expect(queues).toContain("queue_name");
    expect(queues).toContain("workflow_count");
  });
});
