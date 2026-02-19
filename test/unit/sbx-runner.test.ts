import { afterEach, describe, expect, test, vi } from "vitest";

import { runSandboxJob } from "../../src/sbx/runner";
import type { SBXReq } from "../../src/contracts/index";

describe("sbx runner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("mock mode is deterministic", async () => {
    const req: SBXReq = {
      envRef: "test",
      cmd: "ls",
      filesIn: [],
      env: {},
      timeoutMs: 1000,
      limits: { cpu: 1, memMB: 128 },
      net: false,
      taskKey: "test-key"
    };
    const result = await runSandboxJob(req, "mock");
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe("OK\n");
    expect(result.filesOut).toEqual([expect.objectContaining({ path: "out.json", inline: "{}" })]);
  });

  test("live mode fails closed for unsupported provider", async () => {
    vi.stubEnv("SBX_MODE", "live");
    vi.stubEnv("SBX_PROVIDER", "microsandbox");

    const req: SBXReq = {
      envRef: "test",
      cmd: "echo hello",
      filesIn: [],
      env: {},
      timeoutMs: 1000,
      limits: { cpu: 1, memMB: 128 },
      net: false,
      taskKey: "test-key"
    };

    await expect(runSandboxJob(req, "live")).rejects.toThrow(
      "unsupported live SBX provider: microsandbox"
    );
  });
});
