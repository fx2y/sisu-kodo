import type { SBXReq, SBXRes } from "../contracts/index";

export type SBXMode = "mock" | "live";

export type RunInSBXContext = {
  runId: string;
  stepId: string;
};

export interface RunInSBXPort {
  readonly provider: string;
  run(req: SBXReq, ctx: RunInSBXContext): Promise<SBXRes>;
  health(): Promise<{ ok: boolean; provider: string }>;
}
