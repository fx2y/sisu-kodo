import { describe, expect, test } from "vitest";

import { runSandboxJob } from "../../src/sbx/runner";

describe("sbx runner", () => {
  test("mock mode is deterministic", async () => {
    const result = await runSandboxJob({ mode: "mock" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OK\n");
    expect(result.files).toEqual({ "out.json": "{}" });
  });
});
