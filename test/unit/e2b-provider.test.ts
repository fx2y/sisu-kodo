import { describe, expect, test } from "vitest";
import { E2BProvider } from "../../src/sbx/providers/e2b";

describe("E2BProvider", () => {
  test("instantiates and exposes provider health", async () => {
    const provider = new E2BProvider();
    expect(provider.run).toBeDefined();
    expect(provider.provider).toBe("e2b");
    await expect(provider.health()).resolves.toEqual({ ok: true, provider: "e2b" });
  });
});
