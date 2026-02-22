import { describe, expect, test } from "vitest";
import { assertRecipeBundle, assertRecipeSpec } from "../../src/contracts";

const recipe = {
  id: "rcp.test",
  v: "1.0.0",
  name: "Test Recipe",
  tags: ["test"],
  formSchema: { type: "object", additionalProperties: false, properties: {} },
  intentTmpl: { goal: "hello" },
  wfEntry: "Runner.runIntent",
  queue: "intentQ",
  limits: { maxSteps: 10, maxFanout: 5, maxSbxMin: 2, maxTokens: 1000 },
  eval: [{ id: "e1", kind: "file_exists", glob: "artifacts/*.json" }],
  fixtures: [{ id: "fx1", formData: { topic: "x" } }],
  prompts: { compile: "compile prompt", postmortem: "postmortem prompt" }
} as const;

describe("recipe contracts", () => {
  test("accepts valid recipe spec", () => {
    expect(() => assertRecipeSpec(recipe)).not.toThrow();
  });

  test("rejects unknown keys in recipe spec", () => {
    expect(() => assertRecipeSpec({ ...recipe, rogue: true })).toThrow(/invalid RecipeSpec/);
  });

  test("accepts valid recipe bundle", () => {
    expect(() => assertRecipeBundle({ id: recipe.id, versions: [recipe] })).not.toThrow();
  });

  test("rejects unknown keys in recipe bundle", () => {
    expect(() => assertRecipeBundle({ id: recipe.id, versions: [recipe], rogue: true })).toThrow(
      /invalid RecipeBundle/
    );
  });
});
