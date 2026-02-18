import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OCMockDaemon } from "../oc-mock-daemon";
import { OCWrapper } from "../../src/oc/wrapper";
import { getConfig } from "../../src/config";

describe("OC Tool Allowlist", () => {
  let daemon: OCMockDaemon;
  const daemonPort = 4099;

  beforeAll(async () => {
    daemon = new OCMockDaemon(daemonPort);
    await daemon.start();
    process.env.OC_MODE = "live";
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it("should allow plan tools for plan agent", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);

    // This is a bit hard to test without real SDK calls unless we mock the SDK
    // But we can test the assertToolAllowlist directly if we expose it, 
    // or test via port().run()
    
    const runInput = {
      intent: "test",
      schemaVersion: 1,
      seed: "1",
      agent: "plan",
      producer: async () => ({
        prompt: "p",
        toolcalls: [{ name: "grep", args: {} }],
        responses: [],
        diffs: []
      })
    };

    await expect(wrapper.port().run(runInput)).resolves.toBeDefined();
  });

  it("should deny build tools for plan agent", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);

    const runInput = {
      intent: "test",
      schemaVersion: 1,
      seed: "2",
      agent: "plan",
      producer: async () => ({
        prompt: "p",
        toolcalls: [{ name: "edit", args: {} }],
        responses: [],
        diffs: []
      })
    };

    await expect(wrapper.port().run(runInput)).rejects.toThrow("tool-denied: edit for agent plan");
  });

  it("should allow build tools for build agent", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);

    const runInput = {
      intent: "test",
      schemaVersion: 1,
      seed: "3",
      agent: "build",
      producer: async () => ({
        prompt: "p",
        toolcalls: [{ name: "edit", args: {} }],
        responses: [],
        diffs: []
      })
    };

    await expect(wrapper.port().run(runInput)).resolves.toBeDefined();
  });
});
