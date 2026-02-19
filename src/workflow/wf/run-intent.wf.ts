import type { LoadOutput } from "../steps/load.step";
import type { CompiledIntent } from "../steps/compile.step";
import type { PatchedIntent } from "../steps/apply-patch.step";
import type { Decision } from "../steps/decide.step";
import type { ExecutionResult } from "../steps/execute.step";
import type { TaskHandle } from "../port";
import type { SBXReq, SBXRes } from "../../contracts/index";
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

function mergeResults(results: SBXRes[]): SBXRes {
  const firstErr = results.find((r) => r.errCode !== "NONE");
  const artifactRefs = results
    .map((r) => r.artifactIndexRef)
    .filter((ref): ref is string => typeof ref === "string" && ref.length > 0);

  // Aggregate metrics
  const metrics = results.reduce(
    (acc, r) => ({
      wallMs: Math.max(acc.wallMs, r.metrics.wallMs),
      cpuMs: acc.cpuMs + r.metrics.cpuMs,
      memPeakMB: Math.max(acc.memPeakMB, r.metrics.memPeakMB)
    }),
    { wallMs: 0, cpuMs: 0, memPeakMB: 0 }
  );

  return {
    exit: firstErr ? firstErr.exit : 0,
    stdout: results.map((r) => r.stdout).join("\n---\n"),
    stderr: results.map((r) => r.stderr).join("\n---\n"),
    filesOut: results.flatMap((r) => r.filesOut),
    metrics,
    sandboxRef: results.map((r) => r.sandboxRef).join(","),
    errCode: firstErr ? firstErr.errCode : "NONE",
    taskKey: "aggregated",
    artifactIndexRef: artifactRefs.join(","),
    raw: {
      tasks: results.map((r) => ({
        taskKey: r.taskKey,
        errCode: r.errCode,
        exit: r.exit,
        artifactIndexRef: r.artifactIndexRef ?? "",
        metrics: r.metrics
      }))
    }
  };
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
    await steps.emitStatusEvent(workflowId, "waiting_input");
    await steps.waitForEvent(workflowId);
    await steps.updateOps(runId, {
      status: "running",
      error: null,
      nextAction: "NONE"
    });
    await steps.emitStatusEvent(workflowId, "running");
  }
}

async function runCoreSteps(
  steps: IntentWorkflowSteps,
  workflowId: string,
  runId: string,
  intent: Intent,
  queuePartitionKey?: string
): Promise<ExecutionResult> {
  const compiled = await steps.compile(runId, intent);
  await steps.updateOps(runId, { lastStep: "CompileST" });

  if (intent.goal.toLowerCase().includes("ask")) {
    await steps.emitQuestion(runId, "What is the answer?");
    await steps.updateStatus(runId, "waiting_input");
    await steps.emitStatusEvent(workflowId, "waiting_input");
    await steps.waitForEvent(workflowId);
    await steps.updateStatus(runId, "running");
    await steps.emitStatusEvent(workflowId, "running");
  }

  const patched = await steps.applyPatch(runId, compiled);
  await steps.updateOps(runId, { lastStep: "ApplyPatchST" });

  await waitForPlanApproval(steps, workflowId, runId);

  const decision = await steps.decide(runId, patched);
  await steps.updateOps(runId, { lastStep: "DecideST" });

  // Cycle C3: Fan-out execution
  const tasks = await steps.buildTasks(decision, { intentId: workflowId, runId });
  const handles = await Promise.all(
    tasks.map((task) => steps.startTask(task, runId, queuePartitionKey))
  );
  const results = await Promise.all(handles.map((h) => h.getResult()));
  const finalResult = mergeResults(results);

  await steps.saveExecuteStep(runId, finalResult);
  await steps.updateOps(runId, { lastStep: "ExecuteST" });

  if (finalResult.errCode !== "NONE") {
    throw new Error(`SBX execution failed [${finalResult.errCode}]`);
  }
  return finalResult;
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
  buildTasks(decision: Decision, ctx: { intentId: string; runId: string }): Promise<SBXReq[]>;
  startTask(
    req: SBXReq,
    runId: string,
    queuePartitionKey?: string
  ): Promise<TaskHandle<ExecutionResult>>;
  executeTask(req: SBXReq, runId: string): Promise<ExecutionResult>;
  saveExecuteStep(runId: string, result: ExecutionResult): Promise<void>;
  saveArtifacts(runId: string, stepId: string, result: ExecutionResult): Promise<string>;
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
  emitStatusEvent(workflowId: string, status: RunStatus): Promise<void>;
  streamChunk(
    taskKey: string,
    kind: "stdout" | "stderr",
    chunk: string,
    seq: number
  ): Promise<void>;
  waitForEvent(workflowId: string): Promise<unknown>;
}

export async function runIntentWorkflow(steps: IntentWorkflowSteps, workflowId: string) {
  const { runId, intent, queuePartitionKey } = await steps.load(workflowId);

  try {
    await steps.updateOps(runId, { status: "running" });
    await steps.emitStatusEvent(workflowId, "running");
    assertIntent(intent);
    await runCoreSteps(steps, workflowId, runId, intent, queuePartitionKey);
    await steps.updateStatus(runId, "succeeded");
    await steps.emitStatusEvent(workflowId, "succeeded");
  } catch (error: unknown) {
    await persistTerminalFailure(steps, runId, error);
    await steps.emitStatusEvent(workflowId, "failed");
    throw error;
  }
}

export async function repairRunWorkflow(steps: IntentWorkflowSteps, runId: string) {
  await steps.updateOps(runId, { retryCountInc: true, status: "repairing", nextAction: "NONE" });

  try {
    const { intentId } = await steps.getRun(runId);
    const intentRes = await steps.load(intentId);
    const intent = intentRes.intent;
    const queuePartitionKey = intentRes.queuePartitionKey;
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
    const executed = checkpointOrThrow<ExecutionResult>(checkpoints, "ExecuteST");
    if (!executed) {
      // Fanout repair
      const tasks = await steps.buildTasks(decision, { intentId, runId });
      const handles = await Promise.all(
        tasks.map((task) => steps.startTask(task, runId, queuePartitionKey))
      );
      const results = await Promise.all(handles.map((h) => h.getResult()));
      const finalResult = mergeResults(results);

      await steps.saveExecuteStep(runId, finalResult);
      await steps.updateOps(runId, { lastStep: "ExecuteST" });

      if (finalResult.errCode !== "NONE") {
        throw new Error(`SBX execution failed [${finalResult.errCode}]`);
      }
    } else if (executed.errCode !== "NONE") {
      throw new Error(`SBX execution failed [${executed.errCode}]`);
    }

    await steps.updateStatus(runId, "succeeded");
    await steps.emitStatusEvent(intentId, "succeeded");
  } catch (error: unknown) {
    await persistTerminalFailure(steps, runId, error);
    const { intentId: finalIntentId } = await steps.getRun(runId);
    await steps.emitStatusEvent(finalIntentId, "failed");
    throw error;
  }
}
