import type { OCOutput } from "./schema";

export type OCMode = "replay" | "record" | "live";

export interface OCClientPort {
  health(): Promise<void>;
  run(params: {
    intent: string;
    schemaVersion: number;
    seed: string;
    mode?: OCMode;
    agent?: string;
    producer: () => Promise<OCOutput>;
  }): Promise<{ key: string; payload: OCOutput }>;
}
