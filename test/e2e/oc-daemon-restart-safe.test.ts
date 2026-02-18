import { describe, it, expect } from "vitest";
import { OCMockDaemon } from "../oc-mock-daemon";
import { getConfig } from "../../src/config";
import { OCWrapper } from "../../src/oc/wrapper";

describe("OC Daemon Restart Safety", () => {
  it("should be able to recover after daemon restart", async () => {
    const daemonPort = 4098;
    process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
    const cfg = getConfig();
    const daemon = new OCMockDaemon(daemonPort);
    await daemon.start();

    const wrapper = new OCWrapper(cfg);

    // 1. Initial health OK
    await expect(wrapper.health()).resolves.not.toThrow();

    // 2. Kill daemon
    await daemon.stop();
    // Use a fresh request to avoid any keep-alive/caching if applicable
    await expect(wrapper.health()).rejects.toThrow();

    // 3. Restart daemon
    await daemon.start();
    await expect(wrapper.health()).resolves.not.toThrow();

    await daemon.stop();
  });
});
