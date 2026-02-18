import { describe, it, expect } from "vitest";
import { OCWrapper } from "../../src/oc/wrapper";
import { getConfig } from "../../src/config";

describe("OCWrapper boundary tests", () => {
  it("should initialize with config and provide a port", () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    const port = wrapper.port();
    expect(port).toBeDefined();
    expect(port.run).toBeDefined();
  });

  it("should pass the configured mode to the port", async () => {
    const cfg = { ...getConfig(), ocMode: "record" as const };
    const wrapper = new OCWrapper(cfg);
    const port = wrapper.port();

    const result = await port.run({
      intent: "test",
      schemaVersion: 1,
      seed: "1",
      producer: async () => ({ prompt: "p", toolcalls: [], responses: [], diffs: [] })
    });

    expect(result.key).toBeDefined();
  });

  it("should block forbidden tools for plan agent", async () => {
    const cfg = { ...getConfig(), ocMode: "live" as const };
    const wrapper = new OCWrapper(cfg);
    const port = wrapper.port();

    const badProducer = async () => ({
      prompt: "p",
      toolcalls: [{ name: "bash", args: { cmd: "rm -rf /" } }],
      responses: [],
      diffs: []
    });

    await expect(
      port.run({
        intent: "test",
        schemaVersion: 1,
        seed: "1",
        agent: "plan",
        producer: badProducer
      })
    ).rejects.toThrow("tool-denied: bash for agent plan");
  });

  it("should allow bash for build agent", async () => {
    const cfg = { ...getConfig(), ocMode: "live" as const };
    const wrapper = new OCWrapper(cfg);
    const port = wrapper.port();

    const bashProducer = async () => ({
      prompt: "p",
      toolcalls: [{ name: "bash", args: { cmd: "ls" } }],
      responses: [],
      diffs: []
    });

    const result = await port.run({
      intent: "test",
      schemaVersion: 1,
      seed: "1",
      agent: "build",
      producer: bashProducer
    });

    expect(result.payload.toolcalls[0].name).toBe("bash");
  });
});
