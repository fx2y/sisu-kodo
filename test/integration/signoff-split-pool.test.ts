import { beforeAll, afterAll, describe, expect, test } from "vitest";

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { getSignoffBoardService } from "../../src/server/signoff-api";

describe("Signoff Split-Pool Integration (T24)", () => {
  let lifecycle: TestLifecycle;
  const signoffDir = path.join(process.cwd(), ".tmp/signoff");

  beforeAll(async () => {
    lifecycle = await setupLifecycle();
    await fs.mkdir(signoffDir, { recursive: true });

    // Seed dummy mandatory tiles to avoid NO_GO from missing files
    const pfNames = ["quick", "check", "full", "deps", "policy", "crashdemo"];
    const proofNames = [
      "api-run-idem",
      "api-run-drift",
      "malformed-400",
      "x1-audit",
      "split-parity",
      "hitl-dedupe",
      "queue-fairness",
      "budget-guard"
    ];

    for (const name of [...pfNames.map((n) => `pf-${n}`), ...proofNames.map((n) => `proof-${n}`)]) {
      await fs.writeFile(
        path.join(signoffDir, `${name}.json`),
        JSON.stringify({
          id: name,
          label: name.toUpperCase(),
          verdict: "GO",
          evidenceRefs: [`file:.tmp/signoff/${name}.json`],
          ts: Date.now()
        })
      );
    }
  });

  afterAll(async () => {
    await teardownLifecycle(lifecycle);
  });

  test("runs split-pool diversion check successfully (T24)", async () => {
    // 1. Insert a successful run in app.runs
    const wid = `wid-split-${Date.now()}`;
    await lifecycle.pool.query("INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3)", [
      `it-${wid}`,
      "split test goal",
      {}
    ]);
    await lifecycle.pool.query(
      "INSERT INTO app.runs (id, intent_id, workflow_id, status, updated_at) VALUES ($1, $2, $3, $4, NOW())",
      [`run-${wid}`, `it-${wid}`, wid, "succeeded"]
    );

    // 2. Mock a SUCCESS in DBOS (sysPool)
    // In real integration we might not actually have DBOS rows if we didn't start the workflow,
    // but getSignoffBoardService will query it.
    // Since we are using real pools, we should actually have the table.
    // DBOS launch might have created it.

    // We expect 1 mismatch (wid) if it's not in dbos.workflow_status
    const boardBefore = await getSignoffBoardService(lifecycle.pool, lifecycle.sysPool);
    const divTrigger = boardBefore.rollbackTriggers.find((t) => t.id === "trigger-divergence");
    expect(divTrigger?.verdict).toBe("NO_GO");
    expect(divTrigger?.reason).toContain("app/dbos terminal mismatches");

    // 3. Insert matching DBOS row
    // We use sysPool to insert into dbos.workflow_status
    // Note: status is an enum in DBOS, 'SUCCESS' is a valid value.
    await lifecycle.sysPool.query(
      "INSERT INTO dbos.workflow_status (workflow_uuid, status, application_version, queue_name) VALUES ($1, $2, $3, $4)",
      [wid, "SUCCESS", "v1", "intentQ"]
    );

    const boardAfter = await getSignoffBoardService(lifecycle.pool, lifecycle.sysPool);
    const divTriggerAfter = boardAfter.rollbackTriggers.find((t) => t.id === "trigger-divergence");
    expect(divTriggerAfter?.verdict).toBe("GO");
  });

  test("queries x1 triggers using semantic SQL (T25)", async () => {
    // This verifies that it doesn't try to use cross-db join and that the queries run against appPool
    const board = await getSignoffBoardService(lifecycle.pool, lifecycle.sysPool);
    const x1Trigger = board.rollbackTriggers.find((t) => t.id === "trigger-x1-drift");
    expect(x1Trigger).toBeDefined();
    expect(x1Trigger?.verdict).toBe("GO"); // Should be GO with clean tables
  });
});
