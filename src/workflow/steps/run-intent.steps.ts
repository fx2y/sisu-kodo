import { getPool } from "../../db/pool";
import { insertRunStep, updateRunStatus } from "../../db/runRepo";
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

  async compile(runId: string, intent: Intent): Promise<CompiledIntent> {
    const start = nowIso();
    const result = await this.compileImpl.execute(intent);
    assertStepOutput(result);
    await insertRunStep(getPool(), runId, {
      stepId: "CompileST",
      phase: "compilation",
      output: result,
      startedAt: start,
      finishedAt: nowIso()
    });
    return result;
  }

  async applyPatch(runId: string, compiled: CompiledIntent): Promise<PatchedIntent> {
    const start = nowIso();
    const result = await this.applyPatchImpl.execute(compiled);
    assertStepOutput(result);
    await insertRunStep(getPool(), runId, {
      stepId: "ApplyPatchST",
      phase: "patching",
      output: result,
      startedAt: start,
      finishedAt: nowIso()
    });
    return result;
  }

  async decide(runId: string, patched: PatchedIntent): Promise<Decision> {
    const start = nowIso();
    const result = await this.decideImpl.execute(patched);
    assertStepOutput(result);
    await insertRunStep(getPool(), runId, {
      stepId: "DecideST",
      phase: "planning",
      output: result,
      startedAt: start,
      finishedAt: nowIso()
    });
    return result;
  }

  async execute(runId: string, decision: Decision): Promise<ExecutionResult> {
    const start = nowIso();
    const result = await this.executeImpl.execute(decision);
    assertStepOutput(result);
    await insertRunStep(getPool(), runId, {
      stepId: "ExecuteST",
      phase: "execution",
      output: result,
      startedAt: start,
      finishedAt: nowIso()
    });
    return result;
  }

  async saveArtifacts(runId: string, stepId: string, result: ExecutionResult): Promise<void> {
    await this.saveArtifactsImpl.execute(runId, stepId, result);
  }

  async updateStatus(runId: string, status: "running" | "succeeded" | "failed"): Promise<void> {
    await updateRunStatus(getPool(), runId, status);
  }
}
