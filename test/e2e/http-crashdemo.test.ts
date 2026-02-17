import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";

import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;

beforeAll(async () => {
  process.env.WF_SLEEP_MS = "25";
  await DBOS.launch();
  pool = createPool();
  const workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
});

describe("http crashdemo", () => {
  test("accepts request and writes deterministic markers", async () => {
    const wf = `wf_e2e_${process.pid}`;
    const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? "3001"}/crashdemo?wf=${wf}`, {
      method: "POST"
    });

    expect(res.status).toBe(202);

    for (let i = 0; i < 80; i += 1) {
      const marksRes = await fetch(
        `http://127.0.0.1:${process.env.PORT ?? "3001"}/marks?wf=${wf}`,
        { method: "GET" }
      );
      const json = (await marksRes.json()) as Record<string, number>;
      if (json.s1 === 1 && json.s2 === 1) {
        expect(json).toEqual({ s1: 1, s2: 1 });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error("workflow did not settle");
  });
});
