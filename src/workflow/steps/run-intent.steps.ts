import { getPool } from "../../db/pool";
import {
  insertRunStep,
  updateRunStatus,
  updateRunOps,
  findRunById,
  findRunSteps
} from "../../db/runRepo";
import { isPlanApproved } from "../../db/planApprovalRepo";
import { upsertMockReceipt } from "../../db/mockReceiptRepo";
import type { IntentWorkflowSteps } from "../wf/run-intent.wf";
import type { TaskHandle } from "../port";
import type { LoadOutput } from "./load.step";
import { LoadStepImpl } from "./load.step";
import type { CompiledIntent } from "./compile.step";
import { CompileStepImpl } from "./compile.step";
import type { PatchedIntent } from "./apply-patch.step";
import { ApplyPatchStepImpl } from "./apply-patch.step";
import type { Decision } from "./decide.step";
import { DecideStepImpl } from "./decide.step";
import type { ExecutionResult } from "./execute.step";
import { ExecuteStepImpl } from "./execute.step";
import { SaveArtifactsStepImpl } from "./save-artifacts.step";
import { nowIso } from "../../lib/time";
import { sha256 } from "../../lib/hash";
import { assertStepOutput } from "../../contracts/step-output.schema";
import type { SBXReq } from "../../contracts";
import type { Intent } from "../../contracts/intent.schema";
import type { RunStatus, RunStep } from "../../contracts/run-view.schema";
import type { OCClientPort } from "../../oc/port";
import { upsertSbxRun } from "../../db/sbxRunRepo";
import {
  asObject,
  buildReceiptKey,
  nextStepAttempt,
  payloadHash,
  withStepAttempt
} from "./step-counter";
import { isRetryableInfraErrCode } from "../../sbx/failure";
import { assertBuildOutput } from "../../contracts/oc/build.schema";

export class RunIntentStepsImpl implements IntentWorkflowSteps {
  private readonly loadImpl = new LoadStepImpl();
  private readonly compileImpl: CompileStepImpl;
  private readonly applyPatchImpl = new ApplyPatchStepImpl();
  private readonly decideImpl: DecideStepImpl;
  private readonly executeImpl = new ExecuteStepImpl();
  private readonly saveArtifactsImpl = new SaveArtifactsStepImpl();

  constructor(private readonly oc: OCClientPort) {
    this.compileImpl = new CompileStepImpl(oc);
    this.decideImpl = new DecideStepImpl(oc);
  }

  async load(workflowId: string): Promise<LoadOutput> {
    return await this.loadImpl.execute(workflowId);
  }

  async getRun(
    runId: string
  ): Promise<{ intentId: string; status: RunStatus; retryCount: number }> {
    const run = await findRunById(getPool(), runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    return { intentId: run.intent_id, status: run.status, retryCount: run.retry_count };
  }

  async getRunSteps(runId: string): Promise<RunStep[]> {
    const steps = await findRunSteps(getPool(), runId);
    return steps.map((s) => ({
      stepId: s.stepId,
      phase: s.phase,
      output: s.output === undefined || s.output === null ? undefined : asObject(s.output),
      startedAt: s.startedAt?.toISOString(),
      finishedAt: s.finishedAt?.toISOString()
    }));
  }

  async waitForEvent(_workflowId: string): Promise<unknown> {
    // This is a placeholder. In DBOS context, the workflow orchestrator
    // will override this with DBOS.recv.
    throw new Error("waitForEvent not implemented in RunIntentStepsImpl");
  }

  async startTask(
    _req: SBXReq,
    _runId: string,
    _queuePartitionKey?: string
  ): Promise<TaskHandle<ExecutionResult>> {
    throw new Error(
      "startTask not implemented in RunIntentStepsImpl; must be provided by workflow context"
    );
  }

  private async runTrackedStep<T extends Record<string, unknown>>(params: {
    runId: string;
    stepId: string;
    phase: string;
    action: () => Promise<T>;
  }): Promise<{ result: T; attempt: number }> {
    const pool = getPool();
    const startedAt = nowIso();
    const attempt = await nextStepAttempt(pool, params.runId, params.stepId);
    const result = await params.action();
    assertStepOutput(params.stepId, result);
    await insertRunStep(pool, params.runId, {
      stepId: params.stepId,
      phase: params.phase,
      output: withStepAttempt(result, attempt),
      startedAt,
      finishedAt: nowIso()
    });
    return { result, attempt };
  }

  private async persistExecuteRun(
    runId: string,
    request: SBXReq,
    result: ExecutionResult,
    provider: string,
    attempt: number
  ): Promise<void> {
    const pool = getPool();
    const responseWithAttempt: ExecutionResult = {
      ...result,
      raw: {
        ...(result.raw ?? {}),
        attempt
      }
    };
    await upsertSbxRun(pool, {
      runId,
      stepId: "ExecuteST",
      taskKey: result.taskKey,
      provider,
      request,
      response: responseWithAttempt
    });
    await this.saveArtifacts(runId, "ExecuteST", responseWithAttempt);
  }

  private async persistExecuteReceipt(
    runId: string,
    attempt: number,
    decision: Decision,
    result: ExecutionResult
  ): Promise<void> {
    const pool = getPool();
    const requestPayload = asObject(decision);
    const responsePayload = asObject(result);
    const receiptKey = buildReceiptKey(runId, "ExecuteST", requestPayload);
    const seenCount = await upsertMockReceipt(pool, {
      receipt_key: receiptKey,
      run_id: runId,
      step_id: "ExecuteST",
      payload_hash: payloadHash(requestPayload),
      first_attempt: attempt,
      last_attempt: attempt,
      request_payload: requestPayload,
      response_payload: responsePayload
    });
    // For ExecuteST, we only throw on duplicate receipt if it was successful before
    if (seenCount > 1 && result.errCode === "NONE") {
      throw new Error(`duplicate side effect receipt detected for run ${runId} step ExecuteST`);
    }
  }

  async compile(runId: string, intent: Intent): Promise<CompiledIntent> {
    const pool = getPool();
    const attempt = await nextStepAttempt(pool, runId, "CompileST");
    const { result } = await this.runTrackedStep<CompiledIntent>({
      runId,
      stepId: "CompileST",
      phase: "compilation",
      action: () => this.compileImpl.execute(intent, { runId, attempt })
    });
    return result;
  }

  async applyPatch(runId: string, compiled: CompiledIntent): Promise<PatchedIntent> {
    const { result } = await this.runTrackedStep<PatchedIntent>({
      runId,
      stepId: "ApplyPatchST",
      phase: "patching",
      action: () => this.applyPatchImpl.execute(compiled)
    });
    return result;
  }

  async decide(runId: string, patched: PatchedIntent): Promise<Decision> {
    const pool = getPool();
    const attempt = await nextStepAttempt(pool, runId, "DecideST");
    const decisionResult = await this.decideImpl.execute(patched, { runId, attempt });
    const { result } = await this.runTrackedStep<Decision>({
      runId,
      stepId: "DecideST",
      phase: "planning",
      action: async () => decisionResult.decision
    });

    return result;
  }

  async buildTasks(
    decision: Decision,
    ctx: { intentId: string; runId: string }
  ): Promise<SBXReq[]> {
    return this.executeImpl.buildTasks(decision, ctx);
  }

  async executeTask(req: SBXReq, runId: string): Promise<ExecutionResult> {
    const pool = getPool();
    const start = nowIso();
    // For single task execution, we use attempt 1 since it's a child workflow
    const attempt = 1;

    const { result, provider } = await this.executeImpl.executeTask(req, {
      runId
    });
    assertStepOutput("ExecuteST", result);

    await this.persistExecuteRun(runId, req, result, provider, attempt);

    // Throw only retryable infra errors to trigger DBOS retry policy.
    if (isRetryableInfraErrCode(result.errCode)) {
      throw new Error(`SBX Infra Error [${result.errCode}]: ${result.stderr}`);
    }

    return result;
  }

  async saveExecuteStep(runId: string, result: ExecutionResult): Promise<void> {
    const pool = getPool();
    const start = nowIso();
    const attempt = await nextStepAttempt(pool, runId, "ExecuteST");

    assertStepOutput("ExecuteST", result);

    await insertRunStep(pool, runId, {
      stepId: "ExecuteST",
      phase: "execution",
      output: withStepAttempt(result, attempt),
      startedAt: start,
      finishedAt: nowIso()
    });
  }

  async saveArtifacts(runId: string, stepId: string, result: ExecutionResult): Promise<void> {
    await this.saveArtifactsImpl.execute(runId, stepId, result);
  }

  async updateStatus(runId: string, status: RunStatus): Promise<void> {
    await updateRunStatus(getPool(), runId, status);
  }

  async updateOps(
    runId: string,
    ops: {
      status?: RunStatus;
      lastStep?: string;
      error?: string | null;
      retryCountInc?: boolean;
      nextAction?: string | null;
    }
  ): Promise<void> {
    const pool = getPool();
    let retry_count: number | undefined;
    if (ops.retryCountInc) {
      const res = await pool.query<{ retry_count: number }>(
        "UPDATE app.runs SET retry_count = retry_count + 1 WHERE id = $1 RETURNING retry_count",
        [runId]
      );
      retry_count = res.rows[0]?.retry_count;
    }

    await updateRunOps(pool, runId, {
      status: ops.status,
      last_step: ops.lastStep,
      error: ops.error,
      retry_count,
      next_action: ops.nextAction
    });
  }

  async isPlanApproved(runId: string): Promise<boolean> {
    return await isPlanApproved(getPool(), runId);
  }

  async emitQuestion(runId: string, question: string): Promise<void> {
    // Persist as artifact
    const pool = getPool();
    const content = JSON.stringify({ question });
    await pool.query(
      `INSERT INTO app.artifacts (run_id, step_id, idx, kind, inline, sha256)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (run_id, step_id, idx) DO NOTHING`,
      [runId, "HITL", 0, "question_card", content, sha256(content)]
    );
  }
}
