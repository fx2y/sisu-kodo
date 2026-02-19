import type { SBXReq, SBXRes } from "../contracts";
import { assertSBXReq, assertSBXRes } from "../contracts";
import { resolveRunInSBXPort } from "./factory";
import type { RunInSBXContext, SBXMode } from "./port";

const defaultContext: RunInSBXContext = {
  runId: "direct",
  stepId: "ExecuteST"
};

export async function runSandboxJob(req: SBXReq, modeOverride?: SBXMode): Promise<SBXRes> {
  assertSBXReq(req);
  const result = await resolveRunInSBXPort(modeOverride).run(req, defaultContext);
  assertSBXRes(result);
  return result;
}
