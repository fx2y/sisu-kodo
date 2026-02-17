import { DBOS } from "@dbos-inc/dbos-sdk";
import { CrashDemoSteps } from "./steps";

export class CrashDemoWorkflow {
  @DBOS.workflow()
  static async run(workflowId: string, sleepMs: number) {
    await CrashDemoSteps.step1(workflowId);
    await DBOS.sleepms(sleepMs);
    await CrashDemoSteps.step2(workflowId);
  }
}
