import { DBOS } from "@dbos-inc/dbos-sdk";
import { Pool } from "pg";
import { RunIntentStepsImpl } from "../steps/run-intent.steps";
import { OCWrapper } from "../../oc/wrapper";
import { getConfig } from "../../config";
import type { LoadOutput } from "../steps/load.step";
import type { CompiledIntent } from "../steps/compile.step";
import type { PatchedIntent } from "../steps/apply-patch.step";
import type { Decision } from "../steps/decide.step";
import type { ExecutionResult } from "../steps/execute.step";
import type { SBXReq } from "../../contracts/index";
import type { Intent } from "../../contracts/intent.schema";
import type { RunStatus, RunStep } from "../../contracts/run-view.schema";

import { toHitlPromptKey } from "../hitl/keys";

type DBOSStepContext = {
  currentAttempt: number;
  workflowTraceId?: string;
  spanId?: string;
};

type DBOSRuntimeContext = {
  stepStatus?: {
    currentAttempt?: number;
  };
  span?: {
    spanContext?: () => {
      traceId?: string;
      spanId?: string;
    };
  };
};

type PgError = {
  code?: string;
};

function getStepContext(): DBOSStepContext {
  const dbos = DBOS as unknown as DBOSRuntimeContext;
  const spanCtx = dbos.span?.spanContext?.();

  return {
    currentAttempt: dbos.stepStatus?.currentAttempt ?? 1,
    workflowTraceId: spanCtx?.traceId,
    spanId: spanCtx?.spanId
  };
}

export function attachWorkflowAttrs(workflowID: string): void {
  DBOS.logger.info({
    event: "wf-start",
    workflowID,
    workflowName: "IntentWorkflow.run",
    applicationVersion: getConfig().appVersion
  });
}

export function attachStepAttrs(stepId: string, workflowId: string): void {
  const dbos = DBOS as unknown as DBOSRuntimeContext;
  const attempt = dbos.stepStatus?.currentAttempt ?? 1;
  DBOS.logger.info({
    event: "step",
    step_name: stepId,
    step_function_id: stepId,
    attempt,
    workflowID: workflowId
  });
}

@DBOS.className("IntentSteps")
export class IntentSteps {
  private static _impl?: RunIntentStepsImpl;

  private static _sysPool?: Pool;

  private static get impl(): RunIntentStepsImpl {
    if (!IntentSteps._impl) {
      IntentSteps._impl = new RunIntentStepsImpl(new OCWrapper(getConfig()).port());
      // Link the implementation's streamChunk to the DBOS step
      IntentSteps._impl.streamChunk = (taskKey, kind, chunk, seq) =>
        IntentSteps.streamChunk(taskKey, kind, chunk, seq);
      IntentSteps._impl.closeStream = (taskKey, seq) => IntentSteps.closeStream(taskKey, seq);

      // Link the implementation's emitStatusEvent to the DBOS step
      IntentSteps._impl.emitStatusEvent = (workflowId, status) =>
        IntentSteps.emitStatusEvent(workflowId, status);

      // Link the implementation's getSystemPool to a pool connected to the system database
      if (!IntentSteps._sysPool) {
        IntentSteps._sysPool = new Pool({
          connectionString: getConfig().systemDatabaseUrl
        });
      }
      IntentSteps._impl.getSystemPool = () => IntentSteps._sysPool!;
    }
    return IntentSteps._impl;
  }

  static resetImpl(): void {
    IntentSteps._impl = undefined;
    // We don't necessarily want to close sysPool on EVERY resetImpl (which happens between tests)
    // but if we want to be safe, we should.
    // However, the task says "add explicit teardown hook".
  }

  static async teardown(): Promise<void> {
    IntentSteps.resetImpl();
    if (IntentSteps._sysPool) {
      await IntentSteps._sysPool.end();
      IntentSteps._sysPool = undefined;
    }
  }

  static setImpl(impl: RunIntentStepsImpl): void {
    IntentSteps._impl = impl;
  }

  @DBOS.step()
  static async load(workflowId: string): Promise<LoadOutput> {
    attachStepAttrs("load", workflowId);
    return await IntentSteps.impl.load(workflowId);
  }

  static async getRunByWorkflowIdImpure(
    workflowId: string
  ): Promise<{ runId: string; intentId: string } | null> {
    return await IntentSteps.impl.getRunByWorkflowIdImpure(workflowId);
  }

  @DBOS.step()
  static async getRun(
    runId: string
  ): Promise<{ intentId: string; status: RunStatus; retryCount: number }> {
    attachStepAttrs("getRun", runId);
    return await IntentSteps.impl.getRun(runId);
  }

  @DBOS.step()
  static async getRunSteps(runId: string): Promise<RunStep[]> {
    attachStepAttrs("getRunSteps", runId);
    return await IntentSteps.impl.getRunSteps(runId);
  }

  @DBOS.step()
  static async compile(runId: string, intent: Intent): Promise<CompiledIntent> {
    attachStepAttrs("compile", runId);
    const ctx = getStepContext();
    return await IntentSteps.impl.compile(
      runId,
      intent,
      ctx.currentAttempt,
      ctx.workflowTraceId,
      ctx.spanId
    );
  }

  @DBOS.step()
  static async applyPatch(runId: string, compiled: CompiledIntent): Promise<PatchedIntent> {
    attachStepAttrs("applyPatch", runId);
    const ctx = getStepContext();
    return await IntentSteps.impl.applyPatch(
      runId,
      compiled,
      ctx.currentAttempt,
      ctx.workflowTraceId,
      ctx.spanId
    );
  }

  @DBOS.step()
  static async rollbackAppliedPatches(runId: string, stepId: string): Promise<number> {
    attachStepAttrs("rollbackAppliedPatches", runId);
    return await IntentSteps.impl.rollbackAppliedPatches(runId, stepId);
  }

  @DBOS.step()
  static async decide(runId: string, patched: PatchedIntent): Promise<Decision> {
    attachStepAttrs("decide", runId);
    const ctx = getStepContext();
    return await IntentSteps.impl.decide(
      runId,
      patched,
      ctx.currentAttempt,
      ctx.workflowTraceId,
      ctx.spanId
    );
  }

  @DBOS.step()
  static async buildTasks(
    decision: Decision,
    ctx: { intentId: string; runId: string }
  ): Promise<SBXReq[]> {
    attachStepAttrs("buildTasks", ctx.runId);
    return await IntentSteps.impl.buildTasks(decision, ctx);
  }

  @DBOS.step()
  static async saveExecuteStep(
    runId: string,
    result: ExecutionResult,
    decision: Decision
  ): Promise<void> {
    attachStepAttrs("saveExecuteStep", runId);
    const ctx = getStepContext();
    await IntentSteps.impl.saveExecuteStep(
      runId,
      result,
      decision,
      ctx.currentAttempt,
      ctx.workflowTraceId,
      ctx.spanId
    );
  }

  @DBOS.step({
    retriesAllowed: true,
    maxAttempts: 3,
    intervalSeconds: 1,
    backoffRate: 2
  })
  static async executeTask(req: SBXReq, runId: string): Promise<ExecutionResult> {
    attachStepAttrs("executeTask", runId);
    return await IntentSteps.impl.executeTask(req, runId, getStepContext().currentAttempt);
  }

  @DBOS.step()
  static async saveArtifacts(
    runId: string,
    stepId: string,
    result: ExecutionResult
  ): Promise<string> {
    attachStepAttrs("saveArtifacts", runId);
    return await IntentSteps.impl.saveArtifacts(
      runId,
      stepId,
      result,
      getStepContext().currentAttempt
    );
  }

  @DBOS.step()
  static async updateStatus(runId: string, status: RunStatus): Promise<void> {
    attachStepAttrs("updateStatus", runId);
    await IntentSteps.impl.updateStatus(runId, status);
  }

  @DBOS.step()
  static async updateOps(
    runId: string,
    ops: {
      status?: RunStatus;
      lastStep?: string;
      error?: string | null;
      retryCountInc?: boolean;
      nextAction?: string | null;
      salt?: number;
    }
  ): Promise<void> {
    attachStepAttrs("updateOps", runId);
    await IntentSteps.impl.updateOps(runId, ops);
  }

  @DBOS.step()
  static async openHumanGate(runId: string, gateKey: string, topic: string): Promise<void> {
    attachStepAttrs("openHumanGate", runId);
    await IntentSteps.impl.openHumanGate(runId, gateKey, topic);
  }

  @DBOS.step()
  static async wasPromptEmitted(workflowId: string, gateKey: string): Promise<boolean> {
    attachStepAttrs("wasPromptEmitted", workflowId);
    const promptKey = toHitlPromptKey(gateKey);
    const pool = IntentSteps.impl.getSystemPool();
    try {
      const res = (await pool.query(
        "SELECT 1 FROM dbos.workflow_events WHERE workflow_uuid = $1 AND key = $2",
        [workflowId, promptKey]
      )) as { rowCount: number | null };
      return (res.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      // During DBOS bootstrap/reset windows this relation can be transiently unavailable.
      if ((error as PgError).code === "42P01") return false;
      throw error;
    }
  }

  @DBOS.step()
  static async isGateOpen(runId: string, gateKey: string): Promise<boolean> {
    attachStepAttrs("isGateOpen", runId);
    return await IntentSteps.impl.isGateOpen(runId, gateKey);
  }

  @DBOS.step()
  static async isPlanApproved(runId: string): Promise<boolean> {
    attachStepAttrs("isPlanApproved", runId);
    return await IntentSteps.impl.isPlanApproved(runId);
  }

  static async updateOpsImpure(
    runId: string,
    ops: {
      status?: RunStatus;
      lastStep?: string;
      error?: string | null;
      retryCountInc?: boolean;
      nextAction?: string | null;
    }
  ): Promise<void> {
    await IntentSteps.impl.updateOps(runId, ops);
  }

  @DBOS.step()
  static async emitQuestion(runId: string, question: string): Promise<void> {
    attachStepAttrs("emitQuestion", runId);
    await IntentSteps.impl.emitQuestion(runId, question);
  }

  @DBOS.step()
  static async emitStatusEvent(workflowId: string, status: RunStatus): Promise<void> {
    attachStepAttrs("emitStatusEvent", workflowId);
    await IntentSteps.publishTelemetry(workflowId, "status", { status });
  }

  static async emitStatusEventImpure(workflowId: string, status: RunStatus): Promise<void> {
    await IntentSteps.publishTelemetry(workflowId, "status", { status });
  }

  static async streamChunk(
    taskKey: string,
    kind: "stdout" | "stderr",
    chunk: string,
    seq: number
  ): Promise<void> {
    await IntentSteps.publishTelemetry(taskKey, kind, { kind, chunk, seq });
  }

  static async closeStream(_taskKey: string, _seq: number): Promise<void> {
    try {
      // Close all possible SBX streams
      await DBOS.closeStream("stdout");
      await DBOS.closeStream("stderr");
    } catch (_e) {
      // Ignore close failures
    }
  }

  private static async publishTelemetry(
    _destination: string,
    topic: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      // Use DBOS.writeStream for live progress; topic is the stream key.
      // Artifacts in app.artifacts remain source of truth.
      await DBOS.writeStream(topic, payload);

      // If it's a terminal status, close the status stream
      const terminalStatuses: RunStatus[] = ["succeeded", "failed", "canceled", "retries_exceeded"];
      if (topic === "status" && terminalStatuses.includes(payload.status as RunStatus)) {
        await DBOS.closeStream("status");
      }
    } catch (_e) {
      // Ignore telemetry delivery failures
    }
  }
}
