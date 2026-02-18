import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createPool, closePool, getPool } from "../../src/db/pool";
import { findOpencodeCallsByRunId } from "../../src/db/opencodeCallRepo";
import { generateId } from "../../src/lib/id";
import { createOCWrapper } from "../../src/oc/wrapper";
import type { AppConfig } from "../../src/config";

beforeAll(async () => {
  createPool();
});

afterAll(async () => {
  await closePool();
});

describe("OC Ledger V2", () => {
  test("should persist all v2 fields via wrapper", async () => {
    const intentId = generateId("it");
    const runId = generateId("run");
    const stepId = "DecideST";
    const prompt = "test-prompt-v2";
    const schema = { type: "object", properties: { result: { type: "string" } } };

    // Satisfy FKs
    const db = getPool();
    await db.query(
      "INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
      [intentId, "test goal", {}]
    );
    await db.query(
      "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
      [runId, intentId, runId, "running"]
    );

    const config: AppConfig = {
      ocMode: "replay",
      ocBaseUrl: "http://localhost:4096",
      ocTimeoutMs: 10000,
      chaosSleepExecuteMs: 0
    } as AppConfig;

    const wrapper = createOCWrapper(config);
    const sessionId = await wrapper.createSession(runId, "test-session");

    const result = await wrapper.promptStructured(sessionId, prompt, schema, {
      runId,
      stepId,
      attempt: 1,
      agent: "build",
      producer: async () => ({
        prompt,
        toolcalls: [{ name: "read", args: { path: "foo.ts" } }],
        responses: ["ok"],
        diffs: [],
        structured: { result: "ok" },
        usage: { total_tokens: 42 },
        raw_response: "RAW_TEXT"
      })
    });

    expect(result.structured).toEqual({ result: "ok" });

    // Verify DB entry
    const calls = await findOpencodeCallsByRunId(getPool(), runId);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.run_id).toBe(runId);
    expect(call.session_id).toBe(sessionId);
    expect(call.agent).toBe("build");
    expect(call.prompt).toBe(prompt);
    expect(call.structured).toEqual({ result: "ok" });
    expect(call.raw_response).toBe("RAW_TEXT");
    expect(call.tool_calls).toEqual([{ name: "read", args: { path: "foo.ts" } }]);
    expect(call.duration_ms).toBeGreaterThan(0);
    expect(call.error).toBeNull();
  });
});
