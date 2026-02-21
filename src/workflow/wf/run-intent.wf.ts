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
import { approve } from "./hitl-gates";
import { buildGateKey } from "../hitl/gate-key";

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

  // Max attempt
  const maxAttempt = results.reduce((max, r) => {
    const attempt = typeof r.raw?.attempt === "number" ? r.raw.attempt : 1;
    return Math.max(max, attempt);
  }, 1);

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
      attempt: maxAttempt,
      tasks: results.map((r) => ({
        taskKey: r.taskKey,
        errCode: r.errCode,
        exit: r.exit,
        artifactIndexRef: r.artifactIndexRef ?? "",
        metrics: r.metrics,
        attempt: r.raw?.attempt
      }))
    }
  };
}

async function waitForPlanApproval(
  steps: IntentWorkflowSteps,
  workflowId: string,
  runId: string,
  timeoutS: number
): Promise<void> {
  const gateKey = buildGateKey(runId, "ApplyPatchST", "approve-plan", 1);
  const decision = await approve(steps, workflowId, runId, gateKey, timeoutS);

  if (decision.choice !== "yes") {
    throw new Error(`Plan approval failed: ${decision.choice} (rationale: ${decision.rationale})`);
  }
}

async function runCoreSteps(
  steps: IntentWorkflowSteps,
  workflowId: string,
  runId: string,
  intent: Intent,
  options: { queuePartitionKey?: string; planApprovalTimeoutS: number }
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

  await waitForPlanApproval(steps, workflowId, runId, options.planApprovalTimeoutS);

  const decision = await steps.decide(runId, patched);
  await steps.updateOps(runId, { lastStep: "DecideST" });

  // Cycle C3: Fan-out execution
  const tasks = await steps.buildTasks(decision, { intentId: workflowId, runId });
  const handles = await Promise.all(
    tasks.map((task) => steps.startTask(task, runId, options.queuePartitionKey))
  );
  const results = await Promise.all(handles.map((h) => h.getResult()));
  const finalResult = mergeResults(results);

  await steps.saveExecuteStep(runId, finalResult, decision);
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
): Promise<RunStatus> {
  let status: RunStatus = terminalFailureStatus;
  let nextAction: string | null = terminalFailureNextAction;

  const errorMessage = error instanceof Error ? error.message : String(error);
  const isCancel =
    (error instanceof Error && error.name === "DBOSWorkflowCancelledError") ||
    errorMessage.includes("has been cancelled");

  if (isCancel) {
    status = "canceled";
    nextAction = "NONE";
  }

  const ops = {
    status,
    error: error instanceof Error ? error.message : String(error),
    nextAction
  };

  if (isCancel) {
    await steps.updateOpsImpure(runId, ops);
  } else {
    await steps.updateOps(runId, ops);
  }

  return status;
}

export interface IntentWorkflowSteps {
  load(workflowId: string): Promise<LoadOutput>;
  getRunByWorkflowIdImpure(workflowId: string): Promise<{ runId: string; intentId: string } | null>;
  compile(runId: string, intent: Intent): Promise<CompiledIntent>;
  applyPatch(runId: string, compiled: CompiledIntent): Promise<PatchedIntent>;
  decide(runId: string, patched: PatchedIntent): Promise<Decision>;
  buildTasks(decision: Decision, ctx: { intentId: string; runId: string }): Promise<SBXReq[]>;
  startTask(
    req: SBXReq,
    runId: string,
    queuePartitionKey?: string
  ): Promise<TaskHandle<ExecutionResult>>;
  executeTask(req: SBXReq, runId: string, attempt?: number): Promise<ExecutionResult>;
  saveExecuteStep(runId: string, result: ExecutionResult, decision: Decision): Promise<void>;
  saveArtifacts(
    runId: string,
    stepId: string,
    result: ExecutionResult,
    attempt?: number
  ): Promise<string>;
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
  updateOpsImpure(
    runId: string,
    ops: {
      status?: RunStatus;
      lastStep?: string;
      error?: string | null;
      retryCountInc?: boolean;
      nextAction?: string | null;
    }
  ): Promise<void>;
  openHumanGate(runId: string, gateKey: string, topic: string): Promise<void>;
  isGateOpen(runId: string, gateKey: string): Promise<boolean>;
  wasPromptEmitted(workflowId: string, gateKey: string): Promise<boolean>;
  isPlanApproved(runId: string): Promise<boolean>;
  getRun(runId: string): Promise<{ intentId: string; status: RunStatus; retryCount: number }>;
  getRunSteps(runId: string): Promise<RunStep[]>;
  emitQuestion(runId: string, question: string): Promise<void>;
  emitStatusEvent(workflowId: string, status: RunStatus): Promise<void>;
  emitStatusEventImpure(workflowId: string, status: RunStatus): Promise<void>;
  enqueueEscalation(workflowId: string, gateKey: string): Promise<void>;
  streamChunk(
    taskKey: string,
    kind: "stdout" | "stderr",
    chunk: string,
    seq: number
  ): Promise<void>;
  recv<T>(topic: string, timeoutS: number): Promise<T | null>;
  setEvent<T>(key: string, value: T): Promise<void>;
  getTimestamp(): number;
  waitForEvent(workflowId: string): Promise<unknown>;
}

export async function runIntentWorkflow(steps: IntentWorkflowSteps, workflowId: string) {
  let runId: string | undefined;
  try {
    const loaded = await steps.load(workflowId);
    runId = loaded.runId;
    const intent = loaded.intent;
    const queuePartitionKey = loaded.queuePartitionKey;

    await steps.updateOps(runId, { status: "running" });
    await steps.emitStatusEvent(workflowId, "running");
    assertIntent(intent);
    await runCoreSteps(steps, workflowId, runId, intent, {
      queuePartitionKey,
      planApprovalTimeoutS: loaded.planApprovalTimeoutS
    });
    await steps.updateStatus(runId, "succeeded");
    await steps.emitStatusEvent(workflowId, "succeeded");
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(
      `[WF-ERROR] workflowId=${workflowId} runId=${runId} name=${errorName} message=${errorMessage}`
    );

    if (!runId) {
      const runRes = await steps.getRunByWorkflowIdImpure(workflowId);
      if (runRes) runId = runRes.runId;
    }

    if (runId) {
      await persistTerminalFailure(steps, runId, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCancel =
        (error instanceof Error && error.name === "DBOSWorkflowCancelledError") ||
        errorMessage.includes("has been cancelled");

      if (isCancel) {
        await steps.emitStatusEventImpure(workflowId, "canceled");
      } else {
        await steps.emitStatusEvent(workflowId, "failed");
      }
    }
    throw error;
  }
}

export async function repairRunWorkflow(steps: IntentWorkflowSteps, runId: string) {
  let intentId: string | undefined;
  try {
    await steps.updateOps(runId, { retryCountInc: true, status: "repairing", nextAction: "NONE" });

    const run = await steps.getRun(runId);
    intentId = run.intentId;
    const intentRes = await steps.load(intentId);
    const intent = intentRes.intent;
    const queuePartitionKey = intentRes.queuePartitionKey;
    const planApprovalTimeoutS = intentRes.planApprovalTimeoutS;
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
      await waitForPlanApproval(steps, intentId, runId, planApprovalTimeoutS);
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

      await steps.saveExecuteStep(runId, finalResult, decision);
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
    if (intentId) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCancel =
        (error instanceof Error && error.name === "DBOSWorkflowCancelledError") ||
        errorMessage.includes("has been cancelled");

      if (isCancel) {
        await steps.emitStatusEventImpure(intentId, "canceled");
      } else {
        await steps.emitStatusEvent(intentId, "failed");
      }
    }
    throw error;
  }
}
