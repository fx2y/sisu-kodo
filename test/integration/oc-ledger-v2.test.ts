import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createPool, closePool } from "../../src/db/pool";
import type { Pool } from "pg";
import { insertOpencodeCall, findOpencodeCallsByRunId } from "../../src/db/opencodeCallRepo";
import { generateId } from "../../src/lib/id";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { DBOS } from "@dbos-inc/dbos-sdk";

let pool: Pool;
let workflow: DBOSWorkflowEngine;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(20);
});

afterAll(async () => {
  await DBOS.shutdown();
  await pool.end();
  await closePool();
});

describe("OC Ledger V2", () => {
  test("should persist all v2 fields", async () => {
    const intentId = generateId("it_ledger");
    await insertIntent(pool, intentId, { goal: "ledger test", inputs: {}, constraints: {} });
    const { runId } = await startIntentRun(pool, workflow, intentId, {});

    const callId = generateId("call");
    await insertOpencodeCall(pool, {
      id: callId,
      run_id: runId,
      step_id: "DecideST",
      op_key: "test-op-key",
      session_id: "test-session",
      agent: "test-agent",
      schema_hash: "test-schema-hash",
      prompt: "test-prompt",
      structured: { result: "ok" },
      raw_response: "raw",
      tool_calls: [{ name: "tool", args: {} }],
      duration_ms: 123,
      error: null,
      request: { foo: "bar" },
      response: { baz: "qux" },
      diff: null
    });

    const calls = await findOpencodeCallsByRunId(pool, runId);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.op_key).toBe("test-op-key");
    expect(call.session_id).toBe("test-session");
    expect(call.agent).toBe("test-agent");
    expect(call.schema_hash).toBe("test-schema-hash");
    expect(call.prompt).toBe("test-prompt");
    expect(call.structured).toEqual({ result: "ok" });
    expect(call.raw_response).toBe("raw");
    expect(call.tool_calls).toEqual([{ name: "tool", args: {} }]);
    expect(call.duration_ms).toBe(123);
  });
});
