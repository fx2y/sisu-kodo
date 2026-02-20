import { DBOS } from "@dbos-inc/dbos-sdk";
import { IntentSteps } from "./intentSteps";

@DBOS.className("TimeWorkflow")
export class TimeWorkflow {
  @DBOS.workflow()
  static async sleepWorkflow(workflowId: string, sleepMs: number) {
    // 1. Initial artifact: "before-sleep"
    await TimeWorkflow.recordWakeMetadata(workflowId, "before-sleep", sleepMs);

    // 2. Durable sleep
    await DBOS.sleepms(sleepMs);

    // 3. Final artifact: "after-sleep"
    await TimeWorkflow.recordWakeMetadata(workflowId, "after-sleep", sleepMs);

    return { success: true, workflowId, sleepMs };
  }

  @DBOS.step()
  static async recordWakeMetadata(workflowId: string, phase: string, sleepMs: number) {
    const now = Date.now();
    await IntentSteps.saveArtifacts(workflowId, `sleep-${phase}`, {
      exit: 0,
      stdout: "",
      stderr: "",
      filesOut: [],
      metrics: { wallMs: 0, cpuMs: 0, memPeakMB: 0 },
      sandboxRef: "none",
      errCode: "NONE",
      taskKey: "",
      raw: { phase, sleepMs, timestamp: now }
    });
  }
}
