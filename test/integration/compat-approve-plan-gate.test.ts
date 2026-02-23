import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { buildHttpServer } from "../../src/server/http";
import type { TestLifecycle } from "./lifecycle";
import { setupLifecycle, teardownLifecycle } from "./lifecycle";

let lifecycle: TestLifecycle;

beforeAll(async () => {
  lifecycle = await setupLifecycle(350);
});

afterAll(async () => {
  await teardownLifecycle(lifecycle);
});

describe("compat approve-plan gate parity (CY7)", () => {
  async function withShimServer(
    legacyEnabled: boolean,
    run: (baseUrl: string) => Promise<void>
  ): Promise<void> {
    vi.stubEnv("ENABLE_LEGACY_RUN_ROUTES", legacyEnabled ? "true" : "false");
    const server = buildHttpServer(lifecycle.pool, lifecycle.workflow);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("failed to resolve shim test server address");
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    try {
      await run(baseUrl);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  test("shim route disabled => 410", async () => {
    await withShimServer(false, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/runs/missing-run/approve-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvedBy: "x" })
      });
      expect(res.status).toBe(410);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("legacy route disabled");
    });
  });

  test("shim route enabled => deprecation headers present", async () => {
    await withShimServer(true, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/runs/missing-run/approve-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvedBy: "x" })
      });
      expect(res.status).toBe(404);
      expect(res.headers.get("Deprecation")).toBe("true");
      expect(res.headers.get("Sunset")).toBe("Tue, 30 Jun 2026 23:59:59 GMT");
    });
  });

  test("next route disabled => 410", async () => {
    vi.resetModules();
    vi.doMock("@src/config", () => ({
      getConfig: () => ({ enableLegacyRunRoutes: false })
    }));
    const route = await import("../../app/api/runs/[wid]/approve-plan/route");
    const res = await route.POST(new Request("http://localhost/api/runs/wf/approve-plan"), {
      params: Promise.resolve({ wid: "wf" })
    });
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("legacy route disabled");
  });

  test("next route enabled => deprecation headers present", async () => {
    vi.resetModules();
    vi.doMock("@src/config", () => ({
      getConfig: () => ({ enableLegacyRunRoutes: true })
    }));
    vi.doMock("@src/server/singleton", () => ({
      getServices: async () => ({ pool: {}, workflow: {} })
    }));
    vi.doMock("@src/db/runRepo", () => ({
      findRunByIdOrWorkflowId: async () => null
    }));

    const route = await import("../../app/api/runs/[wid]/approve-plan/route");
    const res = await route.POST(new Request("http://localhost/api/runs/wf/approve-plan"), {
      params: Promise.resolve({ wid: "wf" })
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Deprecation")).toBe("true");
    expect(res.headers.get("Sunset")).toBe("Tue, 30 Jun 2026 23:59:59 GMT");
  });
});
