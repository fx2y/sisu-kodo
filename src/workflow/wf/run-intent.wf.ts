import { assertIntent } from "../../contracts/intent.schema";
import type { Intent } from "../../contracts/intent.schema";
import type { OCOutput } from "../../oc/schema";

export interface IntentWorkflowSteps {
  loadContext(workflowId: string): Promise<{ runId: string; intent: Intent }>;
  startRun(runId: string): Promise<void>;
  dummyOCStep(runId: string): Promise<OCOutput>;
  finishRun(runId: string): Promise<void>;
}

export async function runIntentWorkflow(steps: IntentWorkflowSteps, workflowId: string) {
  const { runId, intent } = await steps.loadContext(workflowId);

  // Validate Intent from DB before running
  assertIntent(intent);

  // 2. Start run
  await steps.startRun(runId);

  // 3. Run steps
  await steps.dummyOCStep(runId);

  // 4. Finish run
  await steps.finishRun(runId);
}
