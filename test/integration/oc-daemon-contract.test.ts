import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OCMockDaemon } from "../oc-mock-daemon";
import { OCWrapper } from "../../src/oc/wrapper";
import { getConfig } from "../../src/config";

describe("OC Daemon Contract", () => {
  let daemon: OCMockDaemon;
  const daemonPort = 4105;
  const ocUrl = `http://127.0.0.1:${daemonPort}`;

  beforeAll(async () => {
    daemon = new OCMockDaemon(daemonPort);
    await daemon.start();
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it("should be healthy", async () => {
    process.env.OC_BASE_URL = ocUrl;
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    await expect(wrapper.health()).resolves.not.toThrow();
  });

  it("should allow configured CORS origin", async () => {
    const res = await fetch(`${ocUrl}/global/health`, {
      headers: { Origin: "http://localhost:3000" }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("should deny unconfigured CORS origin", async () => {
    const res = await fetch(`${ocUrl}/global/health`, {
      headers: { Origin: "http://evil.com" }
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("should serve OpenAPI 3.1.x spec at /doc", async () => {
    const res = await fetch(`${ocUrl}/doc`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { openapi: string };
    expect(data.openapi).toMatch(/^3\.1\./);
  });
});
