import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertOCOutput, type OCOutput } from "./schema";

export type OCMode = "replay" | "record" | "live";

export type OCRunInput = {
  intent: string;
  schemaVersion: number;
  seed: string;
  mode?: OCMode;
  producer: () => Promise<OCOutput>;
};

export type OCRunOutput = {
  key: string;
  payload: OCOutput;
};

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

export async function runOC(input: OCRunInput): Promise<OCRunOutput> {
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
