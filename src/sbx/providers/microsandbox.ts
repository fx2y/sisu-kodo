import type { SBXReq, SBXRes } from "../../contracts";
import { nowMs } from "../../lib/time";
import type { RunInSBXContext, RunInSBXPort, RunInSBXOptions } from "../port";

export class MicrosandboxProvider implements RunInSBXPort {
  readonly provider = "microsandbox";

  async run(req: SBXReq, ctx: RunInSBXContext, _options?: RunInSBXOptions): Promise<SBXRes> {
    const start = nowMs();
    // Microsandbox is deferred in v0 substrate; return deterministic unsupported error.
    // No implicit fallback to local shell execution allowed in production paths.
    return {
      exit: 1,
      stdout: "",
      stderr: "microsandbox provider is not implemented in v0; use e2b or mock",
      filesOut: [],
      metrics: {
        wallMs: nowMs() - start,
        cpuMs: 0,
        memPeakMB: 0
      },
      sandboxRef: "microsandbox-unsupported",
      errCode: "BOOT_FAIL",
      taskKey: req.taskKey,
      raw: {
        provider: this.provider,
        ctx,
        status: "UNSUPPORTED",
        template: {
          source: req.templateId ? "hot" : "cold",
          templateId: req.templateId,
          templateKey: req.templateKey,
          depsHash: req.depsHash,
          envRef: req.envRef
        },
        bootMs: nowMs() - start
      }
    };
  }

  async health(): Promise<{ ok: boolean; provider: string }> {
    return { ok: false, provider: this.provider };
  }
}
