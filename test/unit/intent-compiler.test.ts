import { describe, expect, test } from "vitest";
import { instantiateIntent } from "../../src/intent-compiler/instantiate-intent";
import type { RecipeSpec } from "../../src/contracts/recipe.schema";
import { canonicalStringify, sha256 } from "../../src/lib/hash";

const recipe: RecipeSpec = {
  id: "r1",
  v: "v1",
  name: "recipe",
  tags: ["t"],
  formSchema: {
    type: "object",
    properties: {
      goal: { type: "string", default: "g-default" },
      ticket: { type: "string", default: "T-1" }
    },
    required: []
  },
  intentTmpl: {
    goal: "{{formData.goal}}",
    inputs: { ticket: "{{formData.ticket}}" },
    constraints: {}
  },
  wfEntry: "Runner.runIntent",
  queue: "intentQ",
  limits: { maxSteps: 1, maxFanout: 1, maxSbxMin: 1, maxTokens: 1 },
  eval: [],
  fixtures: [],
  prompts: { compile: "x", postmortem: "y" }
};

describe("instantiateIntent", () => {
  test("same input yields same canonical json and hash", () => {
    const a = instantiateIntent(recipe, { goal: "abc", ticket: "T-2" });
    const b = instantiateIntent(recipe, { goal: "abc", ticket: "T-2" });
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(sha256(a)).toBe(sha256(b));
  });

  test("defaults from schema are deterministic", () => {
    const intent = instantiateIntent(recipe, {});
    expect(intent.goal).toBe("g-default");
    expect(intent.inputs.ticket).toBe("T-1");
    expect(intent.constraints.stepLibrary).toEqual({
      primitives: ["Collect", "Fetch", "Extract", "Normalize", "Decide", "Act", "Report", "Legacy"]
    });
  });
});
