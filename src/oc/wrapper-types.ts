import type { OCOutput } from "./schema";
import type { OCClientPort } from "./port";

export type OCMode = "replay" | "record" | "live";

export interface OCWrapperAPI extends OCClientPort {
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
      force?: boolean;
      producer?: () => Promise<OCOutput>;
    }
  ): Promise<OCOutput>;
  revert(sessionId: string, messageId: string): Promise<void>;
  log(message: string, level?: string): Promise<void>;
  agents(): Promise<string[]>;
}
