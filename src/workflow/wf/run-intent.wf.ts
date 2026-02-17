import type { LoadOutput } from "../steps/load.step";
import type { CompiledIntent } from "../steps/compile.step";
import type { PatchedIntent } from "../steps/apply-patch.step";
import type { Decision } from "../steps/decide.step";
import type { ExecutionResult } from "../steps/execute.step";
import type { Intent } from "../../contracts/intent.schema";
import { assertIntent } from "../../contracts/intent.schema";

export interface IntentWorkflowSteps {
  load(workflowId: string): Promise<LoadOutput>;
  compile(runId: string, intent: Intent): Promise<CompiledIntent>;
  applyPatch(runId: string, compiled: CompiledIntent): Promise<PatchedIntent>;
  decide(runId: string, patched: PatchedIntent): Promise<Decision>;
  execute(runId: string, decision: Decision): Promise<ExecutionResult>;
  // For now, we can have a finish step or just let steps persist themselves.
  // C1.T13 mentions SaveArtifacts in the goal description.
  saveArtifacts(runId: string, stepId: string, result: ExecutionResult): Promise<void>;
  updateStatus(runId: string, status: "running" | "succeeded" | "failed"): Promise<void>;
}

export async function runIntentWorkflow(steps: IntentWorkflowSteps, workflowId: string) {
  // 1. Load context
  const { runId, intent } = await steps.load(workflowId);

  // Validate Intent from DB before running
  assertIntent(intent);

  // 2. Mark as running
  await steps.updateStatus(runId, "running");

  // 3. Compile
  const compiled = await steps.compile(runId, intent);

  // 4. Apply Patch
  const patched = await steps.applyPatch(runId, compiled);

  // 5. Decide
  const decision = await steps.decide(runId, patched);

  // 6. Execute
  const result = await steps.execute(runId, decision);

  // 7. Save Artifacts from Execution
  await steps.saveArtifacts(runId, "ExecuteST", result);

  // 8. Mark as succeeded
  await steps.updateStatus(runId, "succeeded");
}
