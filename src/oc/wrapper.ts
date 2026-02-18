import { createHash } from "node:crypto";

import { insertOpencodeCall } from "../db/opencodeCallRepo";
import { getPool } from "../db/pool";
import { generateId } from "../lib/id";
import type { AppConfig } from "../config";
import { OCClientFixtureAdapter } from "./client";
import { getAllowedTools } from "./allowlist";
import { createOpKey } from "./cache-key";
import { assertNoChildSession } from "./child-session-guard";
import type { OCClientPort, OCRunInput, OCRunOutput, PromptStructuredOptions } from "./port";
import type { OCToolCall, OCOutput } from "./schema";
import { SessionRotationPolicy } from "./session-rotation";
import { SessionStore } from "./session-store";
import { StallDetector } from "./stall-detector";
import { runWithTimeoutPolicy } from "./timeout-policy";
import { OCWrapperCache } from "./wrapper-cache";
import { OCSDKAdapter } from "./wrapper-sdk";
import type { OCWrapperAPI } from "./wrapper-types";

const PROMPT_TIGHTEN_SUFFIX = "\n\nIMPORTANT: Be more concise and tighten scope to avoid timeout.";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function asRecordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function createOCWrapper(config: AppConfig): OCWrapper {
  return new OCWrapper(config);
}

export class OCWrapper implements OCWrapperAPI {
  private readonly fixture: OCClientPort;
  private readonly sdk?: OCWrapperAPI;
  private readonly sessionStore = new SessionStore();
  private readonly cache = new OCWrapperCache();
  private readonly sessionRotation = new SessionRotationPolicy();

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
      agents: () => this.agents()
    };
  }

  async run(input: OCRunInput): Promise<OCRunOutput> {
    assertNoChildSession(input);
    const mode = input.mode ?? this.config.ocMode;
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
    assertNoChildSession({ runId, title });
    const existing = this.sessionStore.get(runId);
    if (existing) return existing;

    if (this.config.ocMode === "live" && this.sdk) {
      try {
        const sessionId = await this.sdk.createSession(runId, title);
        this.sessionStore.set(runId, sessionId);
        return sessionId;
      } catch (_error) {
        // Fall through to fixture mode.
      }
    }

    const fakeId = generateId("sess");
    this.sessionStore.set(runId, fakeId);
    return fakeId;
  }

  async promptStructured(
    sessionId: string,
    prompt: string,
    schema: Record<string, unknown>,
    options: PromptStructuredOptions
  ): Promise<OCOutput> {
    assertNoChildSession({ sessionId, prompt, schema, options });

    const promptHash = createHash("sha256").update(prompt).digest("hex");
    const schemaHash = createHash("sha256").update(JSON.stringify(schema)).digest("hex");
    const opKey = createOpKey({
      runId: options.runId,
      stepId: options.stepId,
      attempt: options.attempt,
      promptHash,
      schemaHash
    });

    if (!options.force) {
      const cached = this.cache.get(opKey);
      if (cached) return cached;
    }

    const detector = new StallDetector(options.runId, options.stepId, this.config.ocTimeoutMs);
    const fixtureMode: "replay" | "record" | "live" =
      this.config.ocMode === "replay" && options.producer ? "live" : this.config.ocMode;

    const executePrompt = async (currentPrompt: string): Promise<OCOutput> => {
      if (this.config.ocMode === "live" && this.sdk) {
        try {
          const output = await this.sdk.promptStructured(sessionId, currentPrompt, schema, options);
          detector.heartbeat();
          return output;
        } catch (error: unknown) {
          if (!options.producer) {
            throw error;
          }
        }
      }

      const fallback = await this.fixture.run({
        intent: currentPrompt,
        schemaVersion: 1,
        seed: opKey,
        mode: fixtureMode,
        agent: options.agent,
        producer:
          options.producer ??
          (async () => {
            throw new Error(`No producer or fixture found for opKey ${opKey}`);
          })
      });
      detector.heartbeat();
      return fallback.payload;
    };

    detector.start();
    let resultOutput: OCOutput;
    try {
      resultOutput = await runWithTimeoutPolicy({
        detector,
        initialPrompt: prompt,
        stepId: options.stepId,
        onAttempt: executePrompt,
        onRetry: async () => {
          await this.revert(sessionId, "");
        },
        tightenPrompt: (currentPrompt) => `${currentPrompt}${PROMPT_TIGHTEN_SUFFIX}`
      });
    } finally {
      detector.stop();
    }

    this.assertToolAllowlist(options.agent ?? "build", resultOutput.toolcalls);
    this.cache.set(opKey, resultOutput);

    this.sessionStore.incrementStats(options.runId, 1, resultOutput.usage?.total_tokens ?? 0);
    const stats = this.sessionStore.getStats(options.runId);
    if (stats && this.sessionRotation.shouldRotate(stats)) {
      this.sessionStore.clear(options.runId);
    }

    await insertOpencodeCall(getPool(), {
      id: generateId("occall"),
      run_id: options.runId,
      step_id: options.stepId,
      op_key: opKey,
      session_id: sessionId,
      agent: options.agent ?? "build",
      schema_hash: schemaHash,
      prompt,
      structured: asRecordOrUndefined(resultOutput.structured),
      tool_calls: resultOutput.toolcalls,
      request: { prompt, schema, options: asRecord(options) },
      response: asRecord(resultOutput)
    });

    return resultOutput;
  }

  async revert(sessionId: string, messageId: string): Promise<void> {
    if (this.config.ocMode === "live" && this.sdk) {
      try {
        await this.sdk.revert(sessionId, messageId);
        return;
      } catch (_error) {
        // Fall through to fixture mode.
      }
    }
    await this.fixture.revert(sessionId, messageId);
  }

  async log(message: string, level?: string): Promise<void> {
    if (this.config.ocMode === "live" && this.sdk) {
      try {
        await this.sdk.log(message, level);
        return;
      } catch (_error) {
        // Fall through to fixture mode.
      }
    }
    await this.fixture.log(message, level);
  }

  async agents(): Promise<string[]> {
    if (this.config.ocMode === "live" && this.sdk) {
      try {
        return await this.sdk.agents();
      } catch (_error) {
        // Fall through to fixture mode.
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
