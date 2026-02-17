import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { createPool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import type { WorkflowService } from "../../src/workflow/port";

import type { Pool } from "pg";

let pool: Pool;
let workflow: WorkflowService;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(20);
});

afterAll(async () => {
  await DBOS.shutdown();
  await pool.end();
});

describe("workflow idempotency", () => {
  test("same workflow id does not duplicate side effects", async () => {
    const wf = `wf_integration_${process.pid}`;

    await workflow.trigger(wf);
    await workflow.trigger(wf);
    await workflow.waitUntilComplete(wf, 5000);

    const marks = await workflow.marks(wf);
    expect(marks).toEqual({ s1: 1, s2: 1 });
  });
});
