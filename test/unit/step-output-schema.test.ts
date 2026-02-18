import { describe, it, expect } from "vitest";
import { assertStepOutput } from "../../src/contracts/step-output.schema";
import { ValidationError } from "../../src/contracts/assert";

describe("assertStepOutput strictness", () => {
  it("accepts valid CompileST output", () => {
    const valid = {
      goal: "fix bug",
      plan: ["step 1"],
      patch: [],
      tests: ["test 1"]
    };
    expect(() => assertStepOutput("CompileST", valid)).not.toThrow();
  });

  it("rejects malformed CompileST output (missing plan)", () => {
    const invalid = {
      goal: "fix bug",
      patch: [],
      tests: ["test 1"]
    };
    expect(() => assertStepOutput("CompileST", invalid)).toThrow(ValidationError);
  });

  it("rejects CompileST output with extra properties", () => {
    const invalid = {
      goal: "fix bug",
      plan: ["step 1"],
      patch: [],
      tests: ["test 1"],
      extra: "not allowed"
    };
    expect(() => assertStepOutput("CompileST", invalid)).toThrow(ValidationError);
  });

  it("rejects malformed patch in CompileST", () => {
    const invalid = {
      goal: "fix bug",
      plan: ["step 1"],
      patch: [{ path: "file.ts" }], // missing diff
      tests: ["test 1"]
    };
    expect(() => assertStepOutput("CompileST", invalid)).toThrow(ValidationError);
  });
});
