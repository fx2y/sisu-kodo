import { describe, it, expect } from "vitest";

describe("OC Daemon External Contract", () => {
  const ocUrl = process.env.OC_BASE_URL || "http://127.0.0.1:4196";

  it("should be healthy", async () => {
    const res = await fetch(`${ocUrl}/global/health`);
    expect(res.status).toBe(200);
  });

  it("should allow configured CORS origin", async () => {
    // Note: scripts/oc-daemon-start.sh defaults to http://localhost:3000
    const res = await fetch(`${ocUrl}/global/health`, {
      headers: { Origin: "http://localhost:3000" }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("should serve OpenAPI 3.1.x spec at /doc", async () => {
    const res = await fetch(`${ocUrl}/doc`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { openapi: string };
    expect(data.openapi).toMatch(/^3\.1\./);
  });
});
