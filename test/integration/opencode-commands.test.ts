import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

function load(path: string): string {
  return readFileSync(path, "utf8");
}

describe("opencode commands", () => {
  test("new-recipe command is deterministic scaffold prompt", () => {
    const content = load(".opencode/commands/new-recipe.yaml");
    expect(content).toContain("name: new-recipe");
    expect(content).toContain("Output ONLY file list + unified diffs");
    expect(content).toContain("No new dependencies");
  });

  test("tighten-eval command is deterministic and scope-bounded", () => {
    const content = load(".opencode/commands/tighten-eval.yaml");
    expect(content).toContain("name: tighten-eval");
    expect(content).toContain("Output ONLY a JSON patch");
    expect(content).toContain("no scope expansion");
  });
});
