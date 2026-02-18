import { describe, it, expect } from "vitest";
import { assertStepOutput } from "../../src/contracts/step-output.schema";
import { ValidationError } from "../../src/contracts/assert";

describe("assertStepOutput strictness", () => {
  it("accepts valid CompileST output", () => {
    const valid = {
      goal: "fix bug",
      design: ["d"],
      files: ["f"],
      risks: ["r"],
      tests: ["test 1"]
    };
    expect(() => assertStepOutput("CompileST", valid)).not.toThrow();
  });

  it("rejects malformed CompileST output (missing design)", () => {
    const invalid = {
      goal: "fix bug",
      files: ["f"]
    };
    expect(() => assertStepOutput("CompileST", invalid)).toThrow(ValidationError);
  });

  it("rejects CompileST output with extra properties", () => {
    const invalid = {
      goal: "fix bug",
      design: ["d"],
      files: ["f"],
      risks: ["r"],
      tests: ["t"],
      extra: "not allowed"
    };
    expect(() => assertStepOutput("CompileST", invalid)).toThrow(ValidationError);
  });

  it("rejects CompileST output with legacy patch", () => {
    const invalid = {
      goal: "fix bug",
      design: ["d"],
      files: ["f"],
      risks: ["r"],
      tests: ["t"],
      patch: []
    };
    expect(() => assertStepOutput("CompileST", invalid)).toThrow(ValidationError);
  });
});
