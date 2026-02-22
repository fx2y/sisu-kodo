import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupLifecycle, teardownLifecycle } from "./lifecycle";
import type { TestLifecycle } from "./lifecycle";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { registerScheduledWorkflows } from "../../src/workflow/dbos/scheduledOpsWorkflow";

describe("Time Durability", () => {
  let lifecycle: TestLifecycle;
  let appVersionSeq = 0;
  let previousAppVersion: string | undefined;

  beforeEach(async () => {
    appVersionSeq += 1;
    previousAppVersion = process.env.DBOS__APPVERSION;
    // Isolate each test launch from stale workflow recovery in shared integration lanes.
    process.env.DBOS__APPVERSION = `time-durability-${process.pid}-${appVersionSeq}`;
    // We call registerScheduledWorkflows before setupLifecycle because setupLifecycle calls DBOS.launch()
    registerScheduledWorkflows();
    lifecycle = await setupLifecycle(100);
  });

  afterEach(async () => {
    if (lifecycle) {
      await teardownLifecycle(lifecycle);
    }
    if (previousAppVersion === undefined) {
      delete process.env.DBOS__APPVERSION;
    } else {
      process.env.DBOS__APPVERSION = previousAppVersion;
    }
  });

  it("should survive restart during durable sleep", async () => {
    const workflowId = `sleep-durability-${process.pid}-${appVersionSeq}`;

    // 0. Create dummy intent and run to satisfy FK constraints for artifacts
    await lifecycle.pool.query("INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3)", [
      workflowId,
      "Test Durable Sleep",
      {}
    ]);
    await lifecycle.pool.query(
      "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4)",
      [workflowId, workflowId, workflowId, "PENDING"]
    );

    // 1. Start sleep workflow
    await lifecycle.workflow.startSleepWorkflow(workflowId, 2000);

    // 2. Wait for "before-sleep" artifact
    let beforeArtifact = null;
    for (let i = 0; i < 20; i++) {
      const res = await lifecycle.pool.query(
        "SELECT * FROM app.artifacts WHERE run_id = $1 AND step_id = 'sleep-before-sleep'",
        [workflowId]
      );
      if ((res.rowCount ?? 0) > 0) {
        beforeArtifact = res.rows[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(beforeArtifact).not.toBeNull();

    // 3. "Crash" DBOS (shutdown)
    await DBOS.shutdown();

    // 4. Wait a bit (simulated downtime)
    await new Promise((r) => setTimeout(r, 500));

    // 5. Restart DBOS
    await DBOS.launch();

    // 6. Wait for "after-sleep" artifact
    let afterArtifact = null;
    for (let i = 0; i < 40; i++) {
      const res = await lifecycle.pool.query(
        "SELECT * FROM app.artifacts WHERE run_id = $1 AND step_id = 'sleep-after-sleep'",
        [workflowId]
      );
      if ((res.rowCount ?? 0) > 0) {
        afterArtifact = res.rows[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(afterArtifact).not.toBeNull();
  });

  it("should catch up scheduled runs after downtime", async () => {
    // Scheduled workflows use crontab '*/30 * * * * *' (every 30s)
    // Mode is ExactlyOncePerInterval

    // 1. Stop DBOS to simulate downtime
    console.log("[TEST] Stopping DBOS...");
    await DBOS.shutdown();

    // 2. Wait for at least one interval (e.g., 35s)
    console.log("[TEST] Waiting 35s for scheduled interval...");
    await new Promise((r) => setTimeout(r, 35000));

    // 3. Restart DBOS
    console.log("[TEST] Restarting DBOS...");
    await DBOS.launch();

    // 4. Wait for artifacts of the catch-up run
    console.log("[TEST] Waiting for catch-up artifacts...");
    let caughtUp = false;
    // Allow room for scheduler catch-up after restart under integration lane contention.
    for (let i = 0; i < 70; i++) {
      const res = await lifecycle.pool.query(
        "SELECT count(*) FROM app.artifacts WHERE step_id = 'ScheduledTick'"
      );
      console.log(`[TEST] Tick count: ${res.rows[0].count}`);
      if (parseInt(res.rows[0].count) > 0) {
        caughtUp = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(caughtUp).toBe(true);
  }, 180000); // shutdown+downtime+restart+catch-up under loaded integration lanes
});
