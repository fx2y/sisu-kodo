import type { AppConfig } from "../config";
import type { OCClientPort } from "./port";
import { OCClientFixtureAdapter, type OCRunInput, type OCRunOutput } from "./client";
import type { OCToolCall, OCOutput } from "./schema";
import type { OCWrapperAPI } from "./wrapper-types";
import { OCSDKAdapter } from "./wrapper-sdk";
import { SessionStore } from "./session-store";
import { getAllowedTools } from "./allowlist";
import { OCWrapperCache } from "./wrapper-cache";
import { createOpKey } from "./cache-key";
import { createHash } from "node:crypto";
import { getPool } from "../db/pool";
import { insertOpencodeCall } from "../db/opencodeCallRepo";
import { generateId } from "../lib/id";

export function createOCWrapper(config: AppConfig): OCWrapper {
  return new OCWrapper(config);
}

export class OCWrapper implements OCWrapperAPI {
  private readonly fixture: OCClientPort;
  private readonly sdk?: OCWrapperAPI;
  private readonly sessionStore = new SessionStore();
  private readonly cache = new OCWrapperCache();

  constructor(private readonly config: AppConfig) {
    this.fixture = new OCClientFixtureAdapter();
    if (this.config.ocMode === "live") {
      this.sdk = new OCSDKAdapter(this.config.ocBaseUrl);
    }
  }

  port(): OCClientPort {
    return {
      health: () => this.health(),
      run: (input) => this.run(input),
      createSession: (runId, title) => this.createSession(runId, title),
      promptStructured: (sessionId, prompt, schema, options) =>
        this.promptStructured(sessionId, prompt, schema, options),
      revert: (sessionId, messageId) => this.revert(sessionId, messageId),
      log: (message, level) => this.log(message, level),
      agents: () => this.agents(),
    };
  }

  async run(input: OCRunInput): Promise<OCRunOutput> {
    const mode = input.mode ?? this.config.ocMode;
    // For now, even in live mode, we use the fixture adapter's run() 
    // because it handles the producer logic used in existing tests.
    // OCSDKAdapter.run() is currently a stub.
    const result = await this.fixture.run({ mode, ...input });
    this.assertToolAllowlist(input.agent ?? "build", result.payload.toolcalls);
    return result;
  }

  async health(): Promise<void> {
    if (this.config.ocMode === "live" && this.sdk) {
      return this.sdk.health();
    }
    return this.fixture.health();
  }

  async createSession(runId: string, title: string): Promise<string> {
    const existing = this.sessionStore.get(runId);
    if (existing) return existing;

    if (this.config.ocMode === "live" && this.sdk) {
      try {
        const sessionId = await this.sdk.createSession(runId, title);
        this.sessionStore.set(runId, sessionId);
        return sessionId;
      } catch (_err) {
        // Fallback to fake session if SDK fails (useful for tests without daemon)
      }
    }
    const fakeId = `fake-session-${runId}`;
    this.sessionStore.set(runId, fakeId);
    return fakeId;
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
      retryCount?: number;
      force?: boolean;
      producer?: () => Promise<OCOutput>;
    }
  ): Promise<OCOutput> {
    const promptHash = createHash("sha256").update(prompt).digest("hex");
    const schemaHash = createHash("sha256").update(JSON.stringify(schema)).digest("hex");
    const opKey = createOpKey({
      runId: options.runId,
      stepId: options.stepId,
      attempt: options.attempt,
      promptHash,
      schemaHash,
    });

    if (!options.force) {
      const cached = this.cache.get(opKey);
      if (cached) return cached;
    }

    let resultOutput: OCOutput;
    if (this.config.ocMode === "live" && this.sdk) {
      try {
        resultOutput = await this.sdk.promptStructured(sessionId, prompt, schema, options);
      } catch (err) {
        if (!options.producer) throw err;
        // Fallback to fixture/producer
        const res = await this.fixture.run({
          intent: prompt,
          schemaVersion: 1,
          seed: opKey,
          mode: this.config.ocMode,
          agent: options.agent,
          producer: options.producer,
        });
        resultOutput = res.payload;
      }
    } else {
      // Fallback to fixture/producer
      const res = await this.fixture.run({
        intent: prompt,
        schemaVersion: 1,
        seed: opKey,
        mode: this.config.ocMode,
        agent: options.agent,
        producer:
          options.producer ??
          (async () => {
            throw new Error(`No producer or fixture found for opKey ${opKey}`);
          }),
      });
      resultOutput = res.payload;
    }

    this.assertToolAllowlist(options.agent ?? "build", resultOutput.toolcalls);
    this.cache.set(opKey, resultOutput);

    // Ledger append
    await insertOpencodeCall(getPool(), {
      id: generateId("occall"),
      run_id: options.runId,
      step_id: options.stepId,
      op_key: opKey,
      session_id: sessionId,
      agent: options.agent ?? "build",
      schema_hash: schemaHash,
      prompt: prompt,
      structured: resultOutput.structured as Record<string, unknown>,
      tool_calls: resultOutput.toolcalls,
      request: { prompt, schema, options },
      response: resultOutput as unknown as Record<string, unknown>,
    });

    return resultOutput;
  }

  async revert(sessionId: string, messageId: string): Promise<void> {
    if (this.config.ocMode === "live" && this.sdk) {
      try {
        await this.sdk.revert(sessionId, messageId);
        return;
      } catch (_err) {
        // Fallback
      }
    }
    await this.fixture.revert(sessionId, messageId);
  }

  async log(message: string, level?: string): Promise<void> {
    if (this.config.ocMode === "live" && this.sdk) {
      try {
        await this.sdk.log(message, level);
        return;
      } catch (_err) {
        // Fallback
      }
    }
    await this.fixture.log(message, level);
  }

  async agents(): Promise<string[]> {
    if (this.config.ocMode === "live" && this.sdk) {
      try {
        return await this.sdk.agents();
      } catch (_err) {
        // Fallback
      }
    }
    return this.fixture.agents();
  }

  private assertToolAllowlist(agent: string, toolcalls: OCToolCall[]): void {
    const allowed = getAllowedTools(agent);
    for (const call of toolcalls) {
      if (!allowed.has(call.name)) {
        throw new Error(`tool-denied: ${call.name} for agent ${agent}`);
      }
    }
  }

  get baseUrl(): string {
    return this.config.ocBaseUrl;
  }

  get timeoutMs(): number {
    return this.config.ocTimeoutMs;
  }
}
