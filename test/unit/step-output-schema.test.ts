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

  it("accepts ExecuteST output only when SBXRes contract is satisfied", () => {
    const valid = {
      exit: 0,
      stdout: "ok",
      stderr: "",
      filesOut: [{ path: "out.txt", sha256: "a".repeat(64) }],
      metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 1 },
      sandboxRef: "mock",
      errCode: "NONE",
      taskKey: "task-1"
    };
    expect(() => assertStepOutput("ExecuteST", valid)).not.toThrow();
  });

  it("rejects legacy ExecuteST payload shape", () => {
    const legacy = {
      exitCode: 0,
      stdout: "ok",
      files: { "out.txt": "data" }
    };
    expect(() => assertStepOutput("ExecuteST", legacy)).toThrow(ValidationError);
  });
});
