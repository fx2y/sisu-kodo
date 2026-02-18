import type { OCOutput } from "./schema";

export type OCMode = "replay" | "record" | "live";

export type OCRunInput = {
  intent: string;
  schemaVersion: number;
  seed: string;
  mode?: OCMode;
  agent?: string;
  producer: () => Promise<OCOutput>;
};

export type OCRunOutput = {
  key: string;
  payload: OCOutput;
};

export interface OCClientPort {
  health(): Promise<void>;
  run(params: OCRunInput): Promise<OCRunOutput>;
  createSession(runId: string, title: string): Promise<string>;
  promptStructured(
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
  ): Promise<OCOutput>;
  revert(sessionId: string, messageId: string): Promise<void>;
  log(message: string, level?: string): Promise<void>;
  agents(): Promise<string[]>;
}
