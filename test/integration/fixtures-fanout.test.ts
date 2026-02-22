import { DBOS } from "@dbos-inc/dbos-sdk";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { FixtureWorkflow } from "../../src/workflow/dbos/fixtureWorkflow";

describe("fixtures fanout queue", () => {
  let lifecycle: TestLifecycle;

  beforeAll(async () => {
    lifecycle = await setupLifecycle(1);
  });

  afterAll(async () => {
    await teardownLifecycle(lifecycle);
  });

  test("fixture workflow can run on fixturesQ", async () => {
    const workflowID = `fxq_${Date.now()}`;
    const handle = await DBOS.startWorkflow(FixtureWorkflow.run, {
      workflowID,
      queueName: "fixturesQ"
    })({ id: "r1", v: "1.0.0" }, { id: "f1", formData: { q: 1 } });
    const res = await handle.getResult();
    expect(res.fixtureId).toBe("f1");

    const sys = await lifecycle.sysPool.query<{ queue_name: string }>(
      "SELECT queue_name FROM dbos.workflow_status WHERE workflow_uuid = $1",
      [workflowID]
    );
    expect(sys.rows[0]?.queue_name).toBe("fixturesQ");
  });
});
