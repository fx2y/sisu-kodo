import { DBOS } from "@dbos-inc/dbos-sdk";
import type { WorkflowService } from "./port";
import { CrashDemoWorkflow } from "./dbos/crashDemoWorkflow";
import { CrashDemoSteps } from "./dbos/steps";
import { IntentWorkflow } from "./dbos/intentWorkflow";

export class DBOSWorkflowEngine implements WorkflowService {
  constructor(private readonly sleepMs: number) {}

  async trigger(workflowId: string): Promise<void> {
    // Dispatch based on prefix
    if (workflowId.startsWith("itwf_")) {
      await DBOS.startWorkflow(IntentWorkflow.run, { workflowID: workflowId })(workflowId);
    } else {
      await DBOS.startWorkflow(CrashDemoWorkflow.run, { workflowID: workflowId })(
        workflowId,
        this.sleepMs
      );
    }
  }

  async marks(workflowId: string): Promise<Record<string, number>> {
    // Just call the step directly for read-only.
    // It will run in a temporary workflow.
    return await CrashDemoSteps.getMarks(workflowId);
  }

  async resumeIncomplete(): Promise<void> {
    // DBOS automatically resumes workflows if launch() is called.
  }

  async waitUntilComplete(workflowId: string): Promise<void> {
    const handle = DBOS.retrieveWorkflow(workflowId);
    // getResult() waits for completion.
    await handle.getResult();
  }
}
