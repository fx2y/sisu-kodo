import type { LoadOutput } from "../steps/load.step";
import type { CompiledIntent } from "../steps/compile.step";
import type { PatchedIntent } from "../steps/apply-patch.step";
import type { Decision } from "../steps/decide.step";
import type { ExecutionResult } from "../steps/execute.step";
import type { Intent } from "../../contracts/intent.schema";
import { assertIntent } from "../../contracts/intent.schema";
import type { RunStatus, RunStep } from "../../contracts/run-view.schema";
import { assertStepOutput } from "../../contracts/step-output.schema";

const terminalFailureStatus: RunStatus = "retries_exceeded";
const terminalFailureNextAction = "REPAIR";

type StableStepId = "CompileST" | "ApplyPatchST" | "DecideST" | "ExecuteST";

function checkpointMap(steps: RunStep[]): Map<string, RunStep> {
  return new Map(steps.map((step) => [step.stepId, step]));
}

function checkpointOrThrow<T>(
  checkpoints: Map<string, RunStep>,
  stepId: StableStepId
): T | undefined {
  const step = checkpoints.get(stepId);
  if (!step) return undefined;
  return assertStepOutput(stepId, step.output) as T;
}

async function waitForPlanApproval(
  steps: IntentWorkflowSteps,
  workflowId: string,
  runId: string
): Promise<void> {
  while (!(await steps.isPlanApproved(runId))) {
    await steps.updateOps(runId, {
      status: "waiting_input",
      error: "plan_not_approved",
      nextAction: "APPROVE_PLAN"
    });
    await steps.waitForEvent(workflowId);
    await steps.updateOps(runId, {
      status: "running",
      error: null,
      nextAction: "NONE"
    });
  }
}

async function runCoreSteps(
  steps: IntentWorkflowSteps,
  workflowId: string,
  runId: string,
  intent: Intent
): Promise<ExecutionResult> {
  const compiled = await steps.compile(runId, intent);
  await steps.updateOps(runId, { lastStep: "CompileST" });

  if (intent.goal.toLowerCase().includes("ask")) {
    await steps.emitQuestion(runId, "What is the answer?");
    await steps.updateStatus(runId, "waiting_input");
    await steps.waitForEvent(workflowId);
    await steps.updateStatus(runId, "running");
  }

  const patched = await steps.applyPatch(runId, compiled);
  await steps.updateOps(runId, { lastStep: "ApplyPatchST" });

  await waitForPlanApproval(steps, workflowId, runId);

  const decision = await steps.decide(runId, patched);
  await steps.updateOps(runId, { lastStep: "DecideST" });
  const result = await steps.execute(runId, decision);
  await steps.updateOps(runId, { lastStep: "ExecuteST" });
  return result;
}

async function persistTerminalFailure(
  steps: IntentWorkflowSteps,
  runId: string,
  error: unknown
): Promise<void> {
  await steps.updateOps(runId, {
    status: terminalFailureStatus,
    error: error instanceof Error ? error.message : String(error),
    nextAction: terminalFailureNextAction
  });
}

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
      error?: string | null;
      retryCountInc?: boolean;
      nextAction?: string | null;
      salt?: number;
    }
  ): Promise<void>;
  isPlanApproved(runId: string): Promise<boolean>;
  getRun(runId: string): Promise<{ intentId: string; status: RunStatus; retryCount: number }>;
  getRunSteps(runId: string): Promise<RunStep[]>;
  emitQuestion(runId: string, question: string): Promise<void>;
  waitForEvent(workflowId: string): Promise<unknown>;
}

export async function runIntentWorkflow(steps: IntentWorkflowSteps, workflowId: string) {
  const { runId, intent } = await steps.load(workflowId);

  try {
    await steps.updateOps(runId, { status: "running" });
    assertIntent(intent);
    const result = await runCoreSteps(steps, workflowId, runId, intent);
    await steps.saveArtifacts(runId, "ExecuteST", result);
    await steps.updateStatus(runId, "succeeded");
  } catch (error: unknown) {
    await persistTerminalFailure(steps, runId, error);
    throw error;
  }
}

export async function repairRunWorkflow(steps: IntentWorkflowSteps, runId: string) {
  await steps.updateOps(runId, { retryCountInc: true, status: "repairing", nextAction: "NONE" });

  try {
    const { intentId } = await steps.getRun(runId);
    const intentRes = await steps.load(intentId);
    const intent = intentRes.intent;
    assertIntent(intent);

    const checkpoints = checkpointMap(await steps.getRunSteps(runId));

    const compiled =
      checkpointOrThrow<CompiledIntent>(checkpoints, "CompileST") ??
      (await steps.compile(runId, intent));
    if (!checkpoints.has("CompileST")) {
      await steps.updateOps(runId, { lastStep: "CompileST" });
    }

    const patched =
      checkpointOrThrow<PatchedIntent>(checkpoints, "ApplyPatchST") ??
      (await steps.applyPatch(runId, compiled));
    if (!checkpoints.has("ApplyPatchST")) {
      await steps.updateOps(runId, { lastStep: "ApplyPatchST" });
    }

    if (!checkpoints.has("DecideST")) {
      await waitForPlanApproval(steps, intentId, runId);
    }
    const decision =
      checkpointOrThrow<Decision>(checkpoints, "DecideST") ?? (await steps.decide(runId, patched));
    if (!checkpoints.has("DecideST")) {
      await steps.updateOps(runId, { lastStep: "DecideST" });
    }
    const result =
      checkpointOrThrow<ExecutionResult>(checkpoints, "ExecuteST") ??
      (await steps.execute(runId, decision));
    if (!checkpoints.has("ExecuteST")) {
      await steps.updateOps(runId, { lastStep: "ExecuteST" });
      await steps.saveArtifacts(runId, "ExecuteST", result);
    }

    await steps.updateStatus(runId, "succeeded");
  } catch (error: unknown) {
    await persistTerminalFailure(steps, runId, error);
    throw error;
  }
}
