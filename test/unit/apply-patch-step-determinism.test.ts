import { describe, expect, test } from "vitest";
import { ApplyPatchStepImpl } from "../../src/workflow/steps/apply-patch.step";
import type { CompiledIntent } from "../../src/workflow/steps/compile.types";

describe("ApplyPatchStepImpl determinism", () => {
  test("same input yields byte-identical output (no wall-clock fields)", async () => {
    const step = new ApplyPatchStepImpl();
    const compiled: CompiledIntent = {
      goal: "g",
      design: ["d1"],
      files: ["a.ts"],
      risks: ["r1"],
      tests: ["t1"]
    };

    const a = await step.execute(compiled);
    const b = await step.execute(compiled);

    expect(a).toEqual(b);
    expect(a).not.toHaveProperty("patchedAt");
  });
});
