import type { LoadOutput } from "../steps/load.step";
import type { CompiledIntent } from "../steps/compile.step";
import type { PatchedIntent } from "../steps/apply-patch.step";
import type { Decision } from "../steps/decide.step";
import type { ExecutionResult } from "../steps/execute.step";
import type { Intent } from "../../contracts/intent.schema";
import { assertIntent } from "../../contracts/intent.schema";
import type { RunStatus, RunStep } from "../../contracts/run-view.schema";

export interface IntentWorkflowSteps {
  load(workflowId: string): Promise<LoadOutput>;
  compile(runId: string, intent: Intent): Promise<CompiledIntent>;
  applyPatch(runId: string, compiled: CompiledIntent): Promise<PatchedIntent>;
  decide(runId: string, patched: PatchedIntent): Promise<Decision>;
  execute(runId: string, decision: Decision): Promise<ExecutionResult>;
  saveArtifacts(runId: string, stepId: string, result: ExecutionResult): Promise<void>;
  updateStatus(runId: string, status: RunStatus): Promise<void>;
  updateOps(
    runId: string,
    ops: {
      status?: RunStatus;
      lastStep?: string;
      error?: string;
      retryCountInc?: boolean;
      nextAction?: string;
    }
  ): Promise<void>;
  getRun(runId: string): Promise<{ intentId: string; status: RunStatus }>;
  getRunSteps(runId: string): Promise<RunStep[]>;
  emitQuestion(runId: string, question: string): Promise<void>;
  waitForEvent(workflowId: string): Promise<unknown>;
}

export async function runIntentWorkflow(steps: IntentWorkflowSteps, workflowId: string) {
  // 1. Load context
  const { runId, intent } = await steps.load(workflowId);

  try {
    // Increment retry count
    await steps.updateOps(runId, { retryCountInc: true, status: "running" });

    // Validate Intent from DB before running
    assertIntent(intent);

    // 3. Compile
    const compiled = await steps.compile(runId, intent);
    await steps.updateOps(runId, { lastStep: "CompileST" });

    // HITL check: if goal contains "ask", transition to waiting_input
    if (intent.goal.toLowerCase().includes("ask")) {
      await steps.emitQuestion(runId, "What is the answer?");
      await steps.updateStatus(runId, "waiting_input");
      await steps.waitForEvent(workflowId);
      await steps.updateStatus(runId, "running");
    }

    // 4. Apply Patch
    const patched = await steps.applyPatch(runId, compiled);
    await steps.updateOps(runId, { lastStep: "ApplyPatchST" });

    // 5. Decide
    const decision = await steps.decide(runId, patched);
    await steps.updateOps(runId, { lastStep: "DecideST" });

    // 6. Execute
    const result = await steps.execute(runId, decision);
    await steps.updateOps(runId, { lastStep: "ExecuteST" });

    // 7. Save Artifacts from Execution
    await steps.saveArtifacts(runId, "ExecuteST", result);

    // 8. Mark as succeeded
    await steps.updateStatus(runId, "succeeded");
  } catch (error: unknown) {
    // Record error
    await steps.updateOps(runId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      nextAction: "RETRY"
    });
    throw error;
  }
}

export async function repairRunWorkflow(steps: IntentWorkflowSteps, runId: string) {
  // 1. Mark as repairing
  await steps.updateOps(runId, { status: "repairing", nextAction: "NONE" });

  try {
    const { intentId } = await steps.getRun(runId);
    const intentRes = await steps.load(intentId); // Reuse load to get intent
    const intent = intentRes.intent;
    assertIntent(intent);

    const completedSteps = await steps.getRunSteps(runId);
    const stepIds = new Set(completedSteps.map((s) => s.stepId));

    let compiled: CompiledIntent | undefined;
    if (stepIds.has("CompileST")) {
      compiled = completedSteps.find((s) => s.stepId === "CompileST")?.output as CompiledIntent;
    } else {
      compiled = await steps.compile(runId, intent);
      await steps.updateOps(runId, { lastStep: "CompileST" });
    }

    let patched: PatchedIntent | undefined;
    if (stepIds.has("ApplyPatchST")) {
      patched = completedSteps.find((s) => s.stepId === "ApplyPatchST")?.output as PatchedIntent;
    } else {
      patched = await steps.applyPatch(runId, compiled!);
      await steps.updateOps(runId, { lastStep: "ApplyPatchST" });
    }

    let decision: Decision | undefined;
    if (stepIds.has("DecideST")) {
      decision = completedSteps.find((s) => s.stepId === "DecideST")?.output as Decision;
    } else {
      decision = await steps.decide(runId, patched!);
      await steps.updateOps(runId, { lastStep: "DecideST" });
    }

    let result: ExecutionResult | undefined;
    if (stepIds.has("ExecuteST")) {
      result = completedSteps.find((s) => s.stepId === "ExecuteST")?.output as ExecutionResult;
    } else {
      result = await steps.execute(runId, decision!);
      await steps.updateOps(runId, { lastStep: "ExecuteST" });
      await steps.saveArtifacts(runId, "ExecuteST", result);
    }

    // Mark as succeeded
    await steps.updateStatus(runId, "succeeded");
  } catch (error: unknown) {
    await steps.updateOps(runId, {
      status: "retries_exceeded",
      error: error instanceof Error ? error.message : String(error),
      nextAction: "REPAIR"
    });
    throw error;
  }
}
