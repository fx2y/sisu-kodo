import { DBOS } from "@dbos-inc/dbos-sdk";
import { RunIntentStepsImpl } from "../steps/run-intent.steps";
import type { LoadOutput } from "../steps/load.step";
import type { CompiledIntent } from "../steps/compile.step";
import type { PatchedIntent } from "../steps/apply-patch.step";
import type { Decision } from "../steps/decide.step";
import type { ExecutionResult } from "../steps/execute.step";
import type { Intent } from "../../contracts/intent.schema";
import type { RunStatus, RunStep } from "../../contracts/run-view.schema";

export class IntentSteps {
  private static readonly impl = new RunIntentStepsImpl();

  @DBOS.step()
  static async load(workflowId: string): Promise<LoadOutput> {
    return await IntentSteps.impl.load(workflowId);
  }

  @DBOS.step()
  static async getRun(runId: string): Promise<{ intentId: string; status: RunStatus }> {
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
  static async execute(runId: string, decision: Decision): Promise<ExecutionResult> {
    return await IntentSteps.impl.execute(runId, decision);
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
      error?: string;
      retryCountInc?: boolean;
      nextAction?: string;
    }
  ): Promise<void> {
    await IntentSteps.impl.updateOps(runId, ops);
  }

  @DBOS.step()
  static async emitQuestion(runId: string, question: string): Promise<void> {
    await IntentSteps.impl.emitQuestion(runId, question);
  }
}
