import { getPool } from "../../db/pool";
import {
  insertRunStep,
  updateRunStatus,
  updateRunOps,
  findRunById,
  findRunSteps
} from "../../db/runRepo";
import { insertOpencodeCall } from "../../db/opencodeCallRepo";
import { upsertMockReceipt } from "../../db/mockReceiptRepo";
import type { IntentWorkflowSteps } from "../wf/run-intent.wf";
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
import { assertStepOutput } from "../../contracts/step-output.schema";
import type { Intent } from "../../contracts/intent.schema";
import type { RunStatus, RunStep } from "../../contracts/run-view.schema";
import {
  asObject,
  buildReceiptKey,
  nextStepAttempt,
  payloadHash,
  withStepAttempt
} from "./step-counter";

export class RunIntentStepsImpl implements IntentWorkflowSteps {
  private readonly loadImpl = new LoadStepImpl();
  private readonly compileImpl = new CompileStepImpl();
  private readonly applyPatchImpl = new ApplyPatchStepImpl();
  private readonly decideImpl = new DecideStepImpl();
  private readonly executeImpl = new ExecuteStepImpl();
  private readonly saveArtifactsImpl = new SaveArtifactsStepImpl();

  async load(workflowId: string): Promise<LoadOutput> {
    return await this.loadImpl.execute(workflowId);
  }

  async getRun(runId: string): Promise<{ intentId: string; status: RunStatus }> {
    const run = await findRunById(getPool(), runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    return { intentId: run.intent_id, status: run.status };
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
    assertStepOutput(result);
    await insertRunStep(pool, params.runId, {
      stepId: params.stepId,
      phase: params.phase,
      output: withStepAttempt(result, attempt),
      startedAt,
      finishedAt: nowIso()
    });
    return { result, attempt };
  }

  async compile(runId: string, intent: Intent): Promise<CompiledIntent> {
    const { result } = await this.runTrackedStep<CompiledIntent>({
      runId,
      stepId: "CompileST",
      phase: "compilation",
      action: () => this.compileImpl.execute(intent)
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
    const decisionResult = await this.decideImpl.execute(patched);
    const { result, attempt } = await this.runTrackedStep<Decision>({
      runId,
      stepId: "DecideST",
      phase: "planning",
      action: async () => decisionResult.decision
    });

    await insertOpencodeCall(getPool(), {
      id: buildReceiptKey(runId, "DecideST", { attempt, request: decisionResult.envelope.request }),
      run_id: runId,
      step_id: "DecideST",
      request: decisionResult.envelope.request,
      response: decisionResult.envelope.response,
      diff: decisionResult.envelope.diff
    });

    return result;
  }

  async execute(runId: string, decision: Decision): Promise<ExecutionResult> {
    const pool = getPool();
    const start = nowIso();
    const attempt = await nextStepAttempt(pool, runId, "ExecuteST");
    const result = await this.executeImpl.execute(decision);
    assertStepOutput(result);

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
    if (seenCount > 1) {
      throw new Error(`duplicate side effect receipt detected for run ${runId} step ExecuteST`);
    }

    await insertRunStep(pool, runId, {
      stepId: "ExecuteST",
      phase: "execution",
      output: withStepAttempt(result, attempt),
      startedAt: start,
      finishedAt: nowIso()
    });
    return result;
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
      error?: string;
      retryCountInc?: boolean;
      nextAction?: string;
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

  async emitQuestion(runId: string, question: string): Promise<void> {
    // Persist as artifact
    const pool = getPool();
    await pool.query(
      `INSERT INTO app.artifacts (run_id, step_id, idx, kind, inline, sha256)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (run_id, step_id, idx) DO NOTHING`,
      [runId, "HITL", 0, "question_card", JSON.stringify({ question }), "0000"]
    );
  }
}
