import { DBOS } from "@dbos-inc/dbos-sdk";
import { CrashDemoSteps } from "./steps";
import "./queues";

export class CrashDemoWorkflow {
  @DBOS.workflow({ maxRecoveryAttempts: 10 })
  static async run(workflowId: string, sleepMs: number) {
    await CrashDemoSteps.step1(workflowId);
    await DBOS.sleepms(sleepMs);
    await CrashDemoSteps.step2(workflowId);
  }
}
