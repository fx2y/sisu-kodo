import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { buildHttpServer } from "@src/server/http";
import type { Server } from "node:http";
import { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("Throughput Board API", () => {
  let lifecycle: TestLifecycle;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    lifecycle = await setupLifecycle(350);
    
    // Ensure throughput views are created
    const throughputViewsSql = await readFile(
      join(process.cwd(), "db/migrations/030_throughput_views.sql"),
      "utf8"
    );
    await lifecycle.sysPool.query(throughputViewsSql);

    server = buildHttpServer(lifecycle.pool, lifecycle.workflow, lifecycle.sysPool).listen(0);
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    server.close();
    await teardownLifecycle(lifecycle);
  });

  it("GET /api/ops/throughput returns structured metrics", async () => {
    const resp = await fetch(`${baseUrl}/api/ops/throughput`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body).toHaveProperty("fairness");
    expect(body).toHaveProperty("priority");
    expect(body).toHaveProperty("budgets");
    expect(body).toHaveProperty("templates");
    expect(body).toHaveProperty("k6");

    expect(Array.isArray(body.fairness)).toBe(true);
    expect(Array.isArray(body.priority)).toBe(true);
    expect(Array.isArray(body.budgets)).toBe(true);
    expect(Array.isArray(body.templates)).toBe(true);
    expect(Array.isArray(body.k6)).toBe(true);
  });
});
