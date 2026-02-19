import type { SBXReq, SBXRes } from "../contracts/index";

export type SBXMode = "mock" | "live";

export type RunInSBXContext = {
  runId: string;
  stepId: string;
};

export type SBXStreamChunk = {
  kind: "stdout" | "stderr";
  chunk: string;
  seq: number;
};

export type RunInSBXOptions = {
  onChunk?: (chunk: SBXStreamChunk) => void;
};

export interface RunInSBXPort {
  readonly provider: string;
  run(req: SBXReq, ctx: RunInSBXContext, options?: RunInSBXOptions): Promise<SBXRes>;
  health(): Promise<{ ok: boolean; provider: string }>;
}
