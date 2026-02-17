import { DBOS } from "@dbos-inc/dbos-sdk";
import { RunIntentStepsImpl } from "../steps/run-intent.steps";
import type { OCOutput, Intent } from "../steps/run-intent.steps";

export class IntentSteps {
  private static readonly impl = new RunIntentStepsImpl();

  @DBOS.step()
  static async loadContext(workflowId: string): Promise<{ runId: string; intent: Intent }> {
    return await IntentSteps.impl.loadContext(workflowId);
  }

  @DBOS.step()
  static async startRun(runId: string): Promise<void> {
    await IntentSteps.impl.startRun(runId);
  }

  @DBOS.step()
  static async finishRun(runId: string): Promise<void> {
    await IntentSteps.impl.finishRun(runId);
  }

  @DBOS.step()
  static async dummyOCStep(runId: string): Promise<OCOutput> {
    return await IntentSteps.impl.dummyOCStep(runId);
  }
}
