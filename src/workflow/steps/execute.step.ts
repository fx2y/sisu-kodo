import type { Decision } from "./decide.step";
import { getConfig } from "../../config";
import { assertBuildOutput } from "../../contracts/oc/build.schema";
import type { SBXRes, SBXReq } from "../../contracts/index";
import { buildTaskKey } from "../task-key";
import { resolveRunInSBXPort } from "../../sbx/factory";
import type { RunInSBXPort, SBXMode } from "../../sbx/port";

export type ExecutionResult = SBXRes;
type ResolvePort = (modeOverride?: SBXMode) => RunInSBXPort;

export class ExecuteStepImpl {
  constructor(private readonly resolvePort: ResolvePort = resolveRunInSBXPort) {}

  private resolveCommand(decision: Decision): string {
    if (!decision || !decision.structured) {
      throw new Error("Missing structured output in Decision; rejecting unsafe execution.");
    }
    assertBuildOutput(decision.structured);
    const command = decision.structured.test_command;
    if (!command) {
      throw new Error("Missing test_command in Decision; rejecting unsafe execution.");
    }
    if (command === "FAIL_ME" || command === "INFRA_FAIL" || command === "FLAKY_INFRA_FAIL") {
      return command;
    }
    return command;
  }

  private buildRequest(
    command: string,
    ctx: { intentId: string; runId: string },
    cfg: ReturnType<typeof getConfig>
  ): SBXReq {
    return {
      envRef: "local-node-24",
      cmd: command,
      filesIn: [],
      env: {},
      timeoutMs: cfg.sbxDefaultTimeoutMs,
      limits: { cpu: 1, memMB: 512 },
      net: cfg.sbxDefaultNet,
      taskKey: buildTaskKey({
        intentId: ctx.intentId,
        runId: ctx.runId,
        stepId: "ExecuteST",
        normalizedReq: { cmd: command }
      })
    };
  }

  async execute(
    decision: Decision,
    ctx: { intentId: string; runId: string }
  ): Promise<{ result: SBXRes; request: SBXReq; provider: string }> {
    const cfg = getConfig();

    if (cfg.chaosSleepExecuteMs > 0) {
      console.log(`[Chaos] Sleeping for ${cfg.chaosSleepExecuteMs}ms in ExecuteST...`);
      await new Promise((resolve) => setTimeout(resolve, cfg.chaosSleepExecuteMs));
    }
    const command = this.resolveCommand(decision);
    const sbxReq = this.buildRequest(command, ctx, cfg);
    const port = this.resolvePort(cfg.sbxMode);
    const result = await port.run(sbxReq, { runId: ctx.runId, stepId: "ExecuteST" });

    return { result, request: sbxReq, provider: port.provider };
  }
}
