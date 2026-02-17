import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createPool } from "../../src/db/pool";
import { CustomWorkflowEngine } from "../../src/workflow/engine-custom";
import type { WorkflowService } from "../../src/workflow/port";

import type { Pool } from "pg";

let pool: Pool;
let workflow: WorkflowService;

beforeAll(() => {
  pool = createPool();
  workflow = new CustomWorkflowEngine(pool, 20);
});

afterAll(async () => {
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
