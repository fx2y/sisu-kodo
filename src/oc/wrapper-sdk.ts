import type { OCOutput } from "./schema";
import type { OCWrapperAPI } from "./wrapper-types";
import type { OCRunInput, OCRunOutput } from "./client";
import type { PromptStructuredOptions } from "./port";
import { StructuredOutputError } from "../contracts/error";
import { createHash } from "node:crypto";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function assertRecord(val: unknown, msg: string): asserts val is Record<string, unknown> {
  if (!isRecord(val)) throw new Error(`Not a record: ${msg}`);
}

/**
 * Direct implementation of OCSDKAdapter using fetch to avoid ESM/CJS import issues with @opencode-ai/sdk.
 */
export class OCSDKAdapter implements OCWrapperAPI {
  constructor(private readonly baseUrl: string) {}

  private async request(path: string, options: { method?: string; body?: unknown } = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
      const text = await res.text();
      let error: unknown;
      try {
        error = JSON.parse(text);
      } catch {
        error = { message: text };
      }
      return { error, data: null };
    }

    const data = await res.json();
    return { error: null, data };
  }

  async health(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/global/health`);
    if (!res.ok) {
      throw new Error(`SDK health check failed: ${res.status}`);
    }
  }

  async run(input: OCRunInput): Promise<OCRunOutput> {
    const sessionId = `legacy-run-${input.intent.slice(0, 16)}-${input.seed}`;
    try {
      await this.createSession(sessionId, input.intent);
    } catch (_e) {
      // ignore
    }
    const payload = await this.promptStructured(
      sessionId,
      input.intent,
      {},
      {
        runId: sessionId,
        stepId: "LegacyST",
        attempt: 1
      }
    );
    return { key: sessionId, payload };
  }

  async createSession(_runId: string, title: string): Promise<string> {
    const res = await this.request("/session", {
      method: "POST",
      body: { title }
    });
    if (res.error) throw new Error(`Failed to create session: ${JSON.stringify(res.error)}`);
    const data = res.data;
    assertRecord(data, "createSession data");
    if (typeof data.id !== "string") throw new Error("Missing session id in SDK response");
    return data.id;
  }

  async promptStructured(
    sessionId: string,
    prompt: string,
    schema: Record<string, unknown>,
    options: PromptStructuredOptions
  ): Promise<OCOutput> {
    const res = await this.request(`/session/${sessionId}/prompt`, {
      method: "POST",
      body: {
        agent: options.agent,
        parts: [{ type: "text", text: prompt }],
        format:
          Object.keys(schema).length > 0
            ? {
                type: "json_schema",
                schema: schema,
                retryCount: options.retryCount ?? 3
              }
            : undefined
      }
    });

    if (res.error) {
      const schemaHash = createHash("sha256").update(JSON.stringify(schema)).digest("hex");
      const err = res.error;
      assertRecord(err, "prompt error");
      if (err.name === "StructuredOutputError" || err.attempts) {
        throw new StructuredOutputError(
          typeof err.message === "string" ? err.message : "Structured output failed",
          typeof err.attempts === "number" ? err.attempts : 1,
          err.raw || res.data,
          schemaHash
        );
      }
      throw new Error(`SDK prompt failed: ${JSON.stringify(res.error)}`);
    }

    const data = res.data;
    assertRecord(data, "prompt data");
    const info = data.info;
    assertRecord(info, "prompt info");
    const structured = info.structured_output;
    const rawToolCalls = info.tool_calls;
    const toolcalls = Array.isArray(rawToolCalls)
      ? rawToolCalls.map((tc) => {
          assertRecord(tc, "tool call");
          if (typeof tc.name !== "string") throw new Error("Missing tool name");
          const args = tc.arguments || tc.args || {};
          assertRecord(args, "tool args");
          return { name: tc.name, args };
        })
      : [];

    const usage = data.usage;
    const usageObj =
      isRecord(usage) && typeof usage.total_tokens === "number"
        ? { total_tokens: usage.total_tokens }
        : undefined;

    return {
      prompt,
      toolcalls,
      responses: Array.isArray(data.messages) ? data.messages : [],
      diffs: [],
      structured: isRecord(structured) ? structured : undefined,
      usage: usageObj
    };
  }

  async revert(sessionId: string, messageId: string): Promise<void> {
    await this.request(`/session/${sessionId}/revert`, {
      method: "POST",
      body: { messageID: messageId }
    });
  }

  async log(message: string, level: string = "info"): Promise<void> {
    await this.request("/app/log", {
      method: "POST",
      body: {
        message,
        level: level as "info" | "error" | "warn" | "debug"
      }
    });
  }

  async agents(): Promise<string[]> {
    const res = await this.request("/app/agents");
    if (res.error) throw new Error("Failed to list agents");
    const data = res.data;
    if (!Array.isArray(data)) throw new Error("Agents data is not an array");
    return data.map((a) => {
      assertRecord(a, "agent");
      if (typeof a.id !== "string") throw new Error("Missing agent id");
      return a.id;
    });
  }
}
