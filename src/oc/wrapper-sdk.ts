import type { OCOutput } from "./schema";
import type { OCWrapperAPI } from "./wrapper-types";
import type { OCRunInput, OCRunOutput } from "./client";
import type { PromptStructuredOptions } from "./port";
import { StructuredOutputError } from "../contracts/error";
import { createHash } from "node:crypto";

export class OCSDKAdapter implements OCWrapperAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  constructor(private readonly baseUrl: string) {}

  private async getClient() {
    if (!this.client) {
      // Dynamic import to handle ESM-only package in CJS project
      // @ts-expect-error SDK types are not exported for CJS
      const sdk = await import("@opencode-ai/sdk");
      this.client = sdk.createOpencodeClient({
        baseUrl: this.baseUrl
      });
    }
    return this.client;
  }

  async health(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/global/health`);
    if (!res.ok) {
      throw new Error(`SDK health check failed: ${res.status}`);
    }
  }

  async run(input: OCRunInput): Promise<OCRunOutput> {
    // Legacy support for OCRunInput during transition
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

  async createSession(runId: string, title: string): Promise<string> {
    const client = await this.getClient();
    const res = await client.session.create({
      body: { title }
    });
    if (res.error) throw new Error(`Failed to create session: ${JSON.stringify(res.error)}`);
    return res.data!.id;
  }

  async promptStructured(
    sessionId: string,
    prompt: string,
    schema: Record<string, unknown>,
    options: PromptStructuredOptions
  ): Promise<OCOutput> {
    const client = await this.getClient();
    const res = await client.session.prompt({
      path: { id: sessionId },
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
      const err = res.error as Record<string, unknown>;
      if (err.name === "StructuredOutputError" || err.attempts) {
        throw new StructuredOutputError(
          (err.message as string) || "Structured output failed",
          (err.attempts as number) || 1,
          err.raw || res.data,
          schemaHash
        );
      }
      throw new Error(`SDK prompt failed: ${JSON.stringify(res.error)}`);
    }

    const data = res.data as Record<string, unknown>;
    const info = data?.info as Record<string, unknown>;
    const structured = info?.structured_output;
    const toolcalls =
      (info?.tool_calls as Array<Record<string, unknown>>)?.map((tc) => ({
        name: tc.name as string,
        args:
          (tc.arguments as Record<string, unknown>) ?? (tc.args as Record<string, unknown>) ?? {}
      })) ?? [];

    return {
      prompt,
      toolcalls,
      responses: (data?.messages as unknown[]) ?? [],
      diffs: [],
      structured,
      usage: data?.usage as { total_tokens: number }
    };
  }

  async revert(sessionId: string, messageId: string): Promise<void> {
    const client = await this.getClient();
    await client.session.revert({
      path: { id: sessionId },
      body: { messageID: messageId }
    });
  }

  async log(message: string, level: string = "info"): Promise<void> {
    const client = await this.getClient();
    await client.app.log({
      body: {
        message,
        level: level as "info" | "error" | "warn" | "debug"
      }
    });
  }

  async agents(): Promise<string[]> {
    const client = await this.getClient();
    const res = await client.app.agents();
    if (res.error) throw new Error("Failed to list agents");
    return (res.data as Array<{ id: string }>)!.map((a) => a.id);
  }
}
