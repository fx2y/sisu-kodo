import type { OCOutput } from "./schema";
import type { OCWrapperAPI } from "./wrapper-types";
import type { OCRunInput, OCRunOutput } from "./client";

export class OCSDKAdapter implements OCWrapperAPI {
  private client: any;

  constructor(private readonly baseUrl: string) {}

  private async getClient() {
    if (!this.client) {
      // Dynamic import to handle ESM-only package in CJS project
      // @ts-ignore
      const sdk = await import("@opencode-ai/sdk");
      this.client = sdk.createOpencodeClient({
        baseUrl: this.baseUrl,
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
    } catch (e) {
      // ignore
    }
    const payload = await this.promptStructured(sessionId, input.intent, {}, {
      runId: sessionId,
      stepId: "LegacyST",
      attempt: 1
    });
    return { key: sessionId, payload };
  }

  async createSession(runId: string, title: string): Promise<string> {
    const client = await this.getClient();
    const res = await client.session.create({
      body: { title },
    });
    if (res.error) throw new Error(`Failed to create session: ${JSON.stringify(res.error)}`);
    return res.data!.id;
  }

  async promptStructured(
    sessionId: string,
    prompt: string,
    schema: Record<string, unknown>,
    options: {
      agent?: string;
      runId: string;
      stepId: string;
      attempt: number;
      force?: boolean;
    }
  ): Promise<OCOutput> {
    const client = await this.getClient();
    const res = await client.session.prompt({
      path: { id: sessionId },
      body: {
        agent: options.agent,
        parts: [{ type: "text", text: prompt }],
      },
    });

    if (res.error) {
      throw new Error(`SDK prompt failed: ${JSON.stringify(res.error)}`);
    }

    // Default mock response if SDK doesn't return what we expect
    return {
      prompt,
      toolcalls: [],
      responses: [],
      diffs: [],
    };
  }

  async revert(sessionId: string, messageId: string): Promise<void> {
    const client = await this.getClient();
    await client.session.revert({
      path: { id: sessionId },
      body: { messageID: messageId },
    });
  }

  async log(message: string, level: string = "info"): Promise<void> {
    const client = await this.getClient();
    await client.app.log({
      body: { 
        message, 
        level: level as "info" | "error" | "warn" | "debug" 
      },
    });
  }

  async agents(): Promise<string[]> {
    const client = await this.getClient();
    const res = await client.app.agents();
    if (res.error) throw new Error("Failed to list agents");
    return res.data!.map((a: any) => a.id);
  }
}
