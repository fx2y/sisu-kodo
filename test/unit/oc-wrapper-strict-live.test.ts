import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/oc/wrapper-sdk", () => ({
  OCSDKAdapter: class {
    async createSession() {
      throw new Error("sdk down");
    }
    async promptStructured() {
      throw new Error("sdk down");
    }
  }
}));

import { OCWrapper } from "../../src/oc/wrapper";
import { getConfig } from "../../src/config";

describe("OCWrapper strict live mode", () => {
  it("fails closed when live sdk is unavailable and strict mode is enabled", async () => {
    const cfg = { ...getConfig(), ocMode: "live" as const, ocStrictMode: true };
    const wrapper = new OCWrapper(cfg);
    const port = wrapper.port();

    await expect(port.createSession("run-1", "run-1")).rejects.toThrow(
      "oc_live_unavailable:createSession:sdk down"
    );
  });

  it("falls back when strict mode is disabled", async () => {
    const cfg = { ...getConfig(), ocMode: "live" as const, ocStrictMode: false };
    const wrapper = new OCWrapper(cfg);
    const port = wrapper.port();

    await expect(port.createSession("run-2", "run-2")).resolves.toMatch(/^sess_/);
  });
});
