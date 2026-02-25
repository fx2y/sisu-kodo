import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertIntent } from "../../src/db/intentRepo";
import { generateId } from "../../src/lib/id";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  const workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
});

describe("HITL FSM ingress guard", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}`;

  test("rejects event if run is not in waiting_input", async () => {
    // 1. Create intent
    const intentId = generateId("it_fsm");
    await insertIntent(pool, intentId, { goal: "test fsm", inputs: {}, constraints: {} });

    const runRes = await fetch(`${baseUrl}/api/run`, {
      method: "POST",
      body: JSON.stringify({
        recipeRef: { id: "compile-default", v: "v1" },
        formData: { goal: `fsm-goal-${generateId("it")}` },
        opts: { queuePartitionKey: `test-fsm-${generateId("it")}` }
      }),
      headers: { "content-type": "application/json" }
    });
    const body = await runRes.json();
    if (!runRes.ok) {
      throw new Error(`Failed to start run: ${runRes.status} ${JSON.stringify(body)}`);
    }

    const workflowId = body.workflowID;
    expect(workflowId).toBeDefined();

    // 3. Immediately send event (status will be 'queued' or 'running', not yet 'waiting_input')
    const eventRes = await fetch(`${baseUrl}/runs/${workflowId}/events`, {
      method: "POST",
      body: JSON.stringify({ type: "too_soon", payload: {} }),
      headers: { "content-type": "application/json" }
    });

    if (eventRes.status !== 409) {
      const errBody = await eventRes.json();
      console.error("[DEBUG] FSM failure:", {
        status: eventRes.status,
        body: errBody,
        workflowId,
        runHeader: body
      });
    }

    expect(eventRes.status).toBe(409);
    const error = await eventRes.json();
    expect(error.error).toContain("cannot send event to run in status");
  });
});
