import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { fixtureKey, runOC } from "../../src/oc/client";

describe("oc client", () => {
  test("replay loads fixture by deterministic key", async () => {
    const originalCwd = process.cwd();
    const dir = await mkdtemp(path.join(tmpdir(), "oc-fixture-"));
    process.chdir(dir);
    try {
      const key = fixtureKey("intent", 1, "seed");
      const fixtureDir = path.join(dir, "fixtures", "oc");
      await mkdir(fixtureDir, { recursive: true });
      await writeFile(
        path.join(fixtureDir, `${key}.json`),
        JSON.stringify({ prompt: "p", toolcalls: [], responses: [], diffs: [] })
      );

      const result = await runOC({
        intent: "intent",
        schemaVersion: 1,
        seed: "seed",
        mode: "replay",
        producer: async () => ({ prompt: "x", toolcalls: [], responses: [], diffs: [] })
      });

      expect(result.key).toBe(key);
      expect(result.payload.prompt).toBe("p");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
