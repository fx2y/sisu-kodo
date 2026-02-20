import { getPool } from "../../db/pool";
import {
  insertRunStep,
  updateRunStatus,
  updateRunOps,
  findRunById,
  findRunByWorkflowId,
  findRunSteps
} from "../../db/runRepo";
import { insertArtifact } from "../../db/artifactRepo";
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
import { buildArtifactUri } from "../../lib/artifact-uri";
import { assertStepOutput } from "../../contracts/step-output.schema";
import type { SBXReq } from "../../contracts";
import type { Intent } from "../../contracts/intent.schema";
import type { RunStatus, RunStep } from "../../contracts/run-view.schema";
import type { OCClientPort } from "../../oc/port";
import { insertSbxRun } from "../../db/sbxRunRepo";
import {
  asObject,
  buildReceiptKey,
  nextStepAttempt,
  payloadHash,
  withStepAttempt
} from "./step-counter";
import { findHumanGate, insertHumanGate } from "../../db/humanGateRepo";
import { isRetryableInfraErrCode } from "../../sbx/failure";

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

  async getRunByWorkflowIdImpure(
    workflowId: string
  ): Promise<{ runId: string; intentId: string } | null> {
    const run = await findRunByWorkflowId(getPool(), workflowId);
    if (!run) return null;
    return { runId: run.id, intentId: run.intent_id };
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
    attempt?: number;
    traceId?: string;
    spanId?: string;
  }): Promise<{ result: T; attempt: number }> {
    const pool = getPool();
    const startedAt = nowIso();
    const attempt = params.attempt ?? (await nextStepAttempt(pool, params.runId, params.stepId));
    const result = await params.action();
    assertStepOutput(params.stepId, result);

    // C4.T2: Emit explicit kind:none artifact for steps lacking outputs
    // Check if any artifacts were already inserted by the action
    const artCheck = await pool.query(
      "SELECT 1 FROM app.artifacts WHERE run_id = $1 AND step_id = $2 AND attempt = $3 LIMIT 1",
      [params.runId, params.stepId, attempt]
    );

    if (artCheck.rowCount === 0) {
      await insertArtifact(
        pool,
        params.runId,
        params.stepId,
        999,
        {
          kind: "none",
          uri: buildArtifactUri({
            runId: params.runId,
            stepId: params.stepId,
            taskKey: "",
            name: "none"
          }),
          sha256: sha256("none"),
          inline: { status: "no_artifacts" }
        },
        "",
        attempt
      );
    }

    await insertRunStep(pool, params.runId, {
      stepId: params.stepId,
      phase: params.phase,
      output: withStepAttempt(result, attempt),
      startedAt,
      finishedAt: nowIso(),
      traceId: params.traceId,
      spanId: params.spanId
    });
    return { result, attempt };
  }

  private async persistExecuteRun(
    runId: string,
    request: SBXReq,
    result: ExecutionResult,
    provider: string,
    attempt: number
  ): Promise<string> {
    const pool = getPool();
    const artifactIndexRef = await this.saveArtifacts(runId, "ExecuteST", result, attempt);
    const responseWithAttempt: ExecutionResult = {
      ...result,
      artifactIndexRef,
      raw: {
        ...(result.raw ?? {}),
        attempt
      }
    };
    await insertSbxRun(pool, {
      runId,
      stepId: "ExecuteST",
      taskKey: result.taskKey,
      attempt,
      provider,
      request,
      response: responseWithAttempt
    });
    return artifactIndexRef;
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

  async compile(
    runId: string,
    intent: Intent,
    attempt?: number,
    traceId?: string,
    spanId?: string
  ): Promise<CompiledIntent> {
    const { result } = await this.runTrackedStep<CompiledIntent>({
      runId,
      stepId: "CompileST",
      phase: "compilation",
      action: () => this.compileImpl.execute(intent, { runId, attempt: attempt ?? 1 }),
      attempt,
      traceId,
      spanId
    });
    return result;
  }

  async applyPatch(
    runId: string,
    compiled: CompiledIntent,
    attempt?: number,
    traceId?: string,
    spanId?: string
  ): Promise<PatchedIntent> {
    const { result } = await this.runTrackedStep<PatchedIntent>({
      runId,
      stepId: "ApplyPatchST",
      phase: "patching",
      action: () => this.applyPatchImpl.execute(compiled),
      attempt,
      traceId,
      spanId
    });
    return result;
  }

  async decide(
    runId: string,
    patched: PatchedIntent,
    attempt?: number,
    traceId?: string,
    spanId?: string
  ): Promise<Decision> {
    const { result } = await this.runTrackedStep<Decision>({
      runId,
      stepId: "DecideST",
      phase: "planning",
      action: async () => {
        const decisionResult = await this.decideImpl.execute(patched, {
          runId,
          attempt: attempt ?? 1
        });
        return decisionResult.decision;
      },
      attempt,
      traceId,
      spanId
    });

    return result;
  }

  async buildTasks(
    decision: Decision,
    ctx: { intentId: string; runId: string }
  ): Promise<SBXReq[]> {
    return this.executeImpl.buildTasks(decision, ctx);
  }

  async executeTask(req: SBXReq, runId: string, attempt: number = 1): Promise<ExecutionResult> {
    let nextSeq = 0;
    try {
      const { result, provider } = await this.executeImpl.executeTask(
        req,
        {
          runId
        },
        {
          onChunk: (chunk) => {
            nextSeq = Math.max(nextSeq, chunk.seq + 1);
            // This is where we stream back to the UI via DBOS if in DBOS context.
            // In this implementation, we just call streamChunk which will be overridden.
            void this.streamChunk(req.taskKey, chunk.kind, chunk.chunk, chunk.seq);
          }
        }
      );
      assertStepOutput("ExecuteST", result);

      const artifactIndexRef = await this.persistExecuteRun(runId, req, result, provider, attempt);
      const resultWithArtifacts: ExecutionResult = {
        ...result,
        artifactIndexRef,
        raw: {
          ...(result.raw ?? {}),
          attempt
        }
      };

      // Throw only retryable infra errors to trigger DBOS retry policy.
      if (isRetryableInfraErrCode(resultWithArtifacts.errCode)) {
        throw new Error(
          `SBX Infra Error [${resultWithArtifacts.errCode}]: ${resultWithArtifacts.stderr}`
        );
      }

      return resultWithArtifacts;
    } finally {
      await this.closeStream(req.taskKey, nextSeq);
    }
  }

  async saveExecuteStep(
    runId: string,
    result: ExecutionResult,
    decision: Decision,
    attempt?: number,
    traceId?: string,
    spanId?: string
  ): Promise<void> {
    const pool = getPool();
    const start = nowIso();
    // Use attempt from result.raw if available (e.g. from mergeResults), otherwise use DBOS-provided or next from DB.
    const resultAttempt = typeof result.raw?.attempt === "number" ? result.raw.attempt : undefined;
    const finalAttempt =
      resultAttempt ?? attempt ?? (await nextStepAttempt(pool, runId, "ExecuteST"));

    assertStepOutput("ExecuteST", result);

    await this.persistExecuteReceipt(runId, finalAttempt, decision, result);

    await insertRunStep(pool, runId, {
      stepId: "ExecuteST",
      phase: "execution",
      output: withStepAttempt(result, finalAttempt),
      startedAt: start,
      finishedAt: nowIso(),
      traceId,
      spanId
    });
  }

  async saveArtifacts(
    runId: string,
    stepId: string,
    result: ExecutionResult,
    attempt: number = 1
  ): Promise<string> {
    return await this.saveArtifactsImpl.execute(runId, stepId, result, attempt);
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

  async updateOpsImpure(
    runId: string,
    ops: {
      status?: RunStatus;
      lastStep?: string;
      error?: string | null;
      retryCountInc?: boolean;
      nextAction?: string | null;
    }
  ): Promise<void> {
    await this.updateOps(runId, ops);
  }

  async openHumanGate(runId: string, gateKey: string, topic: string): Promise<void> {
    await insertHumanGate(getPool(), { runId, gateKey, topic });
  }

  async wasPromptEmitted(_workflowId: string, _gateKey: string): Promise<boolean> {
    // Placeholder for system DB check
    return false;
  }

  async isGateOpen(runId: string, gateKey: string): Promise<boolean> {
    const gate = await findHumanGate(getPool(), runId, gateKey);
    return gate !== null;
  }

  async recv<T>(_topic: string, _timeoutS: number): Promise<T | null> {
    throw new Error("recv not implemented in RunIntentStepsImpl");
  }

  async setEvent<T>(_key: string, _value: T): Promise<void> {
    throw new Error("setEvent not implemented in RunIntentStepsImpl");
  }

  async isPlanApproved(runId: string): Promise<boolean> {
    return await isPlanApproved(getPool(), runId);
  }

  async emitQuestion(runId: string, question: string): Promise<void> {
    // Persist as artifact
    const pool = getPool();
    const content = { question };
    await insertArtifact(pool, runId, "HITL", 0, {
      kind: "question_card",
      uri: buildArtifactUri({
        runId,
        stepId: "HITL",
        taskKey: "",
        name: "question.json"
      }),
      inline: content,
      sha256: sha256(content)
    });
  }

  async emitStatusEvent(_workflowId: string, _status: RunStatus): Promise<void> {
    // Placeholder. Overridden in DBOS context.
  }

  async emitStatusEventImpure(workflowId: string, status: RunStatus): Promise<void> {
    await this.emitStatusEvent(workflowId, status);
  }

  async streamChunk(
    _taskKey: string,
    _kind: "stdout" | "stderr",
    _chunk: string,
    _seq: number
  ): Promise<void> {
    // Placeholder. Overridden in DBOS context.
  }

  async closeStream(_taskKey: string, _seq: number): Promise<void> {
    // Placeholder. Overridden in DBOS context.
  }

  getSystemPool(): { query: (text: string, params: unknown[]) => Promise<unknown> } {
    return getPool(); // Default to app pool, overridden in DBOS context if needed.
  }
}
