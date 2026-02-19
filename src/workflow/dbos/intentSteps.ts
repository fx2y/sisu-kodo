import { DBOS } from "@dbos-inc/dbos-sdk";
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

export class IntentSteps {
  private static _impl?: RunIntentStepsImpl;

  private static get impl(): RunIntentStepsImpl {
    if (!IntentSteps._impl) {
      IntentSteps._impl = new RunIntentStepsImpl(new OCWrapper(getConfig()).port());
    }
    return IntentSteps._impl;
  }

  static resetImpl(): void {
    IntentSteps._impl = undefined;
  }

  static setImpl(impl: RunIntentStepsImpl): void {
    IntentSteps._impl = impl;
  }

  @DBOS.step()
  static async load(workflowId: string): Promise<LoadOutput> {
    return await IntentSteps.impl.load(workflowId);
  }

  @DBOS.step()
  static async getRun(
    runId: string
  ): Promise<{ intentId: string; status: RunStatus; retryCount: number }> {
    return await IntentSteps.impl.getRun(runId);
  }

  @DBOS.step()
  static async getRunSteps(runId: string): Promise<RunStep[]> {
    return await IntentSteps.impl.getRunSteps(runId);
  }

  @DBOS.step()
  static async compile(runId: string, intent: Intent): Promise<CompiledIntent> {
    return await IntentSteps.impl.compile(runId, intent);
  }

  @DBOS.step()
  static async applyPatch(runId: string, compiled: CompiledIntent): Promise<PatchedIntent> {
    return await IntentSteps.impl.applyPatch(runId, compiled);
  }

  @DBOS.step()
  static async decide(runId: string, patched: PatchedIntent): Promise<Decision> {
    return await IntentSteps.impl.decide(runId, patched);
  }

  @DBOS.step()
  static async buildTasks(
    decision: Decision,
    ctx: { intentId: string; runId: string }
  ): Promise<SBXReq[]> {
    return await IntentSteps.impl.buildTasks(decision, ctx);
  }

  @DBOS.step()
  static async saveExecuteStep(runId: string, result: ExecutionResult): Promise<void> {
    await IntentSteps.impl.saveExecuteStep(runId, result);
  }

  @DBOS.step({
    retriesAllowed: true,
    maxAttempts: 3,
    intervalSeconds: 1,
    backoffRate: 2
  })
  static async executeTask(req: SBXReq, runId: string): Promise<ExecutionResult> {
    return await IntentSteps.impl.executeTask(req, runId);
  }

  @DBOS.step()
  static async saveArtifacts(
    runId: string,
    stepId: string,
    result: ExecutionResult
  ): Promise<void> {
    await IntentSteps.impl.saveArtifacts(runId, stepId, result);
  }

  @DBOS.step()
  static async updateStatus(runId: string, status: RunStatus): Promise<void> {
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
    await IntentSteps.impl.updateOps(runId, ops);
  }

  @DBOS.step()
  static async isPlanApproved(runId: string): Promise<boolean> {
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
    await IntentSteps.impl.emitQuestion(runId, question);
  }
}
