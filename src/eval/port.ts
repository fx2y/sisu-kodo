export type EvalCheckResult = {
  checkId: string;
  pass: boolean;
  reason: string;
};

export interface EvalRunnerPort {
  evaluateRun(runId: string): Promise<EvalCheckResult[]>;
}
