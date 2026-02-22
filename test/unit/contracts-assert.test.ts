import { describe, it, expect } from "vitest";
import { assertSBXReq, assertSBXRes, assertArtifactIndex } from "../../src/contracts/index";

describe("SBX Contract Assertions", () => {
  const validReq = {
    envRef: "node-24",
    cmd: "ls",
    filesIn: [{ path: "foo.txt", inline: "content" }],
    env: { FOO: "bar" },
    timeoutMs: 30000,
    limits: { cpu: 1, memMB: 512 },
    net: false,
    taskKey: "abc-123"
  };

  const validRes = {
    exit: 0,
    stdout: "ok",
    stderr: "",
    filesOut: [{ path: "out.txt", sha256: "deadbeef" }],
    metrics: { wallMs: 100, cpuMs: 100, memPeakMB: 10 },
    sandboxRef: "local",
    errCode: "NONE",
    taskKey: "abc-123"
  };

  const validIndex = {
    taskKey: "abc-123",
    provider: "local",
    items: [{ kind: "file", uri: "foo", sha256: "bar" }],
    rawRef: "raw-1",
    createdAt: "2026-02-18T00:00:00Z"
  };

  it("should validate valid SBXReq", () => {
    expect(() => assertSBXReq(validReq)).not.toThrow();
  });

  it("should validate template-aware SBXReq", () => {
    expect(() =>
      assertSBXReq({
        ...validReq,
        templateId: "tpl_123",
        templateKey: "r1:1.0.0:deadbeef",
        depsHash: "deadbeef"
      })
    ).not.toThrow();
  });

  it("should throw on invalid SBXReq", () => {
    const invalid = { ...validReq, cmd: undefined };
    expect(() => assertSBXReq(invalid)).toThrow();
  });

  it("should validate valid SBXRes", () => {
    expect(() => assertSBXRes(validRes)).not.toThrow();
  });

  it("should throw on invalid SBXRes", () => {
    const invalid = { ...validRes, errCode: "INVALID" };
    expect(() => assertSBXRes(invalid)).toThrow();
  });

  it("should validate valid ArtifactIndex", () => {
    expect(() => assertArtifactIndex(validIndex)).not.toThrow();
  });
});
