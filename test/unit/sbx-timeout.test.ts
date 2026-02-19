import { describe, expect, test } from "vitest";
import { getLocalShellActiveCount, LocalShellProvider } from "../../src/sbx/providers/mock";
import type { SBXReq } from "../../src/contracts/index";

describe("LocalShellProvider timeout", () => {
  test("returns TIMEOUT errCode on sleep longer than timeoutMs", async () => {
    const provider = new LocalShellProvider();
    const req: SBXReq = {
      envRef: "test",
      cmd: "sleep 2",
      filesIn: [],
      env: {},
      timeoutMs: 500,
      limits: { cpu: 1, memMB: 128 },
      net: false,
      taskKey: "timeout-test"
    };
    const result = await provider.run(req, { runId: "run-timeout", stepId: "ExecuteST" });
    expect(result.errCode).toBe("TIMEOUT");
    expect(result.exit).not.toBe(0);
    expect(getLocalShellActiveCount()).toBe(0);
  });
});
