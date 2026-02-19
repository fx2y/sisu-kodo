import { describe, expect, test } from "vitest";
import { getLocalShellActiveCount, LocalShellProvider } from "../../src/sbx/providers/mock";
import type { SBXReq } from "../../src/contracts";

describe("SBX timeout cleanup", () => {
  test("timeout kills process and leaves no active local-shell ghosts", async () => {
    const provider = new LocalShellProvider();
    const req: SBXReq = {
      envRef: "local",
      cmd: "sleep 2",
      filesIn: [],
      env: {},
      workdir: undefined,
      timeoutMs: 100,
      limits: { cpu: 1, memMB: 128 },
      net: false,
      taskKey: "timeout-cleanup"
    };

    const result = await provider.run(req, { runId: "run-timeout-cleanup", stepId: "ExecuteST" });
    expect(result.errCode).toBe("TIMEOUT");
    expect(getLocalShellActiveCount()).toBe(0);
  });
});
