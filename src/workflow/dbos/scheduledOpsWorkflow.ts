import { DBOS, SchedulerMode } from "@dbos-inc/dbos-sdk";
import { getConfig } from "../../config";
import { IntentSteps } from "./intentSteps";
import { getPool } from "../../db/pool";

@DBOS.className("ScheduledOpsWorkflow")
export class ScheduledOpsWorkflow {
  @DBOS.workflow()
  @DBOS.scheduled({
    crontab: "*/30 * * * * *",
    mode: SchedulerMode.ExactlyOncePerInterval
  })
  static async tick(schedTime: Date, startTime: Date) {
    const workflowId = `sched-${schedTime.getTime()}`;
    DBOS.logger.info({
      event: "scheduled-tick",
      schedTime,
      startTime,
      workflowName: "ScheduledOpsWorkflow.tick",
      applicationVersion: getConfig().appVersion,
      workflowId
    });

    // 0. Ensure run exists for FK satisfaction
    const pool = getPool();
    const schedId = "scheduled-ops";
    await pool.query(
      "INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [schedId, "Scheduled Ops", {}]
    );
    await pool.query(
      "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [workflowId, schedId, workflowId, "SUCCESS"]
    );

    // Record tick as artifact
    const now = Date.now();
    await IntentSteps.saveArtifacts(workflowId, "ScheduledTick", {
      exit: 0,
      stdout: `Tick for ${schedTime.toISOString()}`,
      stderr: "",
      filesOut: [],
      metrics: { wallMs: 0, cpuMs: 0, memPeakMB: 0 },
      sandboxRef: "none",
      errCode: "NONE",
      taskKey: "",
      raw: { schedTime: schedTime.toISOString(), startTime: startTime.toISOString() }
    });
  }
}

export function registerScheduledWorkflows() {
  // Now we don't need to call anything, just importing the class registers it via decorators.
  // But we keep the function for compatibility with the entrypoints that call it.
}
