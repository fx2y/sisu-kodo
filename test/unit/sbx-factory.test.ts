import { describe, expect, it } from "vitest";
import type { SBXReq } from "../../src/contracts";
import { assertSBXRes } from "../../src/contracts";
import { resolveRunInSBXPort } from "../../src/sbx/factory";
import { E2BProvider } from "../../src/sbx/providers/e2b";
import { MicrosandboxProvider } from "../../src/sbx/providers/microsandbox";
import { MockProvider } from "../../src/sbx/providers/mock";

describe("sbx-factory", () => {
  const baseCfg = {
    sbxMode: "live" as const,
    sbxProvider: "e2b" as const,
    sbxAltProviderEnabled: false
  };

  it("defaults to mock if mode is mock", () => {
    const provider = resolveRunInSBXPort("mock", baseCfg);
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it("returns E2B if provider is e2b and mode is live", () => {
    const provider = resolveRunInSBXPort(undefined, baseCfg);
    expect(provider).toBeInstanceOf(E2BProvider);
  });

  it("throws if microsandbox is selected but alt provider is disabled", () => {
    expect(() =>
      resolveRunInSBXPort(undefined, { ...baseCfg, sbxProvider: "microsandbox" })
    ).toThrow(/microsandbox provider is disabled/);
  });

  it("returns MicrosandboxProvider if enabled", () => {
    const provider = resolveRunInSBXPort(undefined, {
      ...baseCfg,
      sbxProvider: "microsandbox",
      sbxAltProviderEnabled: true
    });
    expect(provider).toBeInstanceOf(MicrosandboxProvider);
  });

  it("microsandbox path preserves SBXRes contract under parity flag", async () => {
    const provider = resolveRunInSBXPort(undefined, {
      ...baseCfg,
      sbxProvider: "microsandbox",
      sbxAltProviderEnabled: true
    });
    const req: SBXReq = {
      envRef: "ubuntu:24.04",
      cmd: "echo hi",
      filesIn: [],
      env: {},
      timeoutMs: 1000,
      limits: { cpu: 1, memMB: 128 },
      net: false,
      taskKey: "parity-task"
    };
    const res = await provider.run(req, { runId: "run-parity", stepId: "ExecuteST" });
    expect(res.errCode).toBe("BOOT_FAIL");
    expect(res.raw).toMatchObject({ provider: "microsandbox", status: "UNSUPPORTED" });
    expect(() => assertSBXRes(res)).not.toThrow();
  });
});
