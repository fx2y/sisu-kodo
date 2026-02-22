import type { EvalCheckResult } from "../contracts/eval.schema";

export interface EvalRunnerPort {
  evaluateRun(runId: string): Promise<EvalCheckResult[]>;
}
