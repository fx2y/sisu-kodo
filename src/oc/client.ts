import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertOCOutput, type OCOutput } from "./schema";
import type { OCClientPort, OCMode } from "./port";

export type { OCMode };

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

export class OCClientFixtureAdapter implements OCClientPort {
  async health(): Promise<void> {
    // Fixture adapter is always healthy as it reads from local disk
    return Promise.resolve();
  }

  async run(input: OCRunInput): Promise<OCRunOutput> {
    const mode = input.mode ?? "replay";
    const key = fixtureKey(input.intent, input.schemaVersion, input.seed);
    const file = fixturePathForKey(key);

    if (mode === "replay") {
      const content = await readFile(file, "utf8");
      const payload: unknown = JSON.parse(content);
      assertOCOutput(payload);
      return { key, payload };
    }

    const payload = await input.producer();
    assertOCOutput(payload);

    if (mode === "record") {
      await mkdir(fixturesDir(), { recursive: true });
      await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    }

    return { key, payload };
  }

  async createSession(runId: string, title: string): Promise<string> {
    return `fake-session-${runId}`;
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
    // For now, fixture adapter doesn't support structured prompt replay
    // but it could by mapping to run() if we had a way to map the prompt to an intent.
    throw new Error("promptStructured not implemented in OCClientFixtureAdapter");
  }

  async revert(sessionId: string, messageId: string): Promise<void> {}

  async log(message: string, level?: string): Promise<void> {}

  async agents(): Promise<string[]> {
    return ["plan", "build"];
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const pairs = Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`);
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fixtureKey(intent: string, schemaVersion: number, seed: string): string {
  const raw = canonicalize({ intent, schemaVersion, seed });
  return createHash("sha256").update(raw).digest("hex");
}

function fixturesDir(): string {
  return path.join(process.cwd(), "fixtures", "oc");
}

function fixturePathForKey(key: string): string {
  return path.join(fixturesDir(), `${key}.json`);
}

/**
 * @deprecated Use OCClientPort.run via OCClientFixtureAdapter
 */
export async function runOC(input: OCRunInput): Promise<OCRunOutput> {
  return new OCClientFixtureAdapter().run(input);
}
