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

    const output = execSync(`./scripts/ops/list_failed.sh 50`).toString();
    expect(output).toContain(workflowID);
  });

  test("cancel_batch.sh cancels a pending/enqueued workflow", async () => {
    const workflowID = generateId("it_cancel_batch");
    await lc.workflow.startSlowStep(workflowID, 5000);

    // It can be ENQUEUED or PENDING
    const statusBefore = await lc.workflow.getWorkflowStatus(workflowID);
    expect(["ENQUEUED", "PENDING"]).toContain(statusBefore);

    execSync(`./scripts/ops/cancel_batch.sh`, { input: workflowID + "\n" });

    const statusAfter = await waitForWorkflowStatus(lc.workflow, workflowID, "CANCELLED", 5000);
    expect(statusAfter).toBe("CANCELLED");
  });

  test("resume_batch.sh resumes a cancelled workflow", async () => {
    const workflowID = generateId("it_resume_batch");
    await lc.workflow.startSlowStep(workflowID, 5000);
    await lc.workflow.cancelWorkflow(workflowID);
    
    await waitForWorkflowStatus(lc.workflow, workflowID, "CANCELLED", 5000);

    execSync(`./scripts/ops/resume_batch.sh`, { input: workflowID + "\n" });

    const statusAfter = await lc.workflow.getWorkflowStatus(workflowID);
    // It should move away from CANCELLED
    expect(["PENDING", "ENQUEUED", "SUCCESS"]).toContain(statusAfter);
  });

  test("fork_batch.sh forks a workflow", async () => {
    const workflowID = generateId("it_fork_base");
    await lc.workflow.startCrashDemo(workflowID);
    await lc.workflow.waitUntilComplete(workflowID, 5000);

    const steps = await lc.workflow.listWorkflowSteps(workflowID);
    const stepN = steps[0].functionId;

    const output = execSync(`./scripts/ops/fork_batch.sh ${stepN}`, { input: workflowID + "\n" }).toString();
    expect(output).toContain(`Forking workflow ${workflowID}`);
  });

  test("SQL views return expected columns", async () => {
    // Recent failures
    const failures = execSync(`scripts/db/psql-sys.sh -c "SELECT * FROM app.v_ops_failures_24h LIMIT 1"`).toString();
    expect(failures).toContain("workflow_uuid");
    expect(failures).toContain("status");

    // Queue depth
    const queues = execSync(`scripts/db/psql-sys.sh -c "SELECT * FROM app.v_ops_queue_depth"`).toString();
    expect(queues).toContain("queue_name");
    expect(queues).toContain("workflow_count");
  });
});
