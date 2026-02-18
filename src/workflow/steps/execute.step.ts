import type { Decision } from "./decide.step";
import { runSandboxJob } from "../../sbx/runner";
import { getConfig } from "../../config";
import { assertBuildOutput } from "../../contracts/oc/build.schema";
import type { SBXRes, SBXReq } from "../../contracts/index";
import { buildTaskKey } from "../task-key";

export type ExecutionResult = SBXRes;

export class ExecuteStepImpl {
  private resolveCommand(decision: Decision): string {
    if (!decision || !decision.structured) {
      throw new Error("Missing structured output in Decision; rejecting unsafe execution.");
    }
    assertBuildOutput(decision.structured);
    const command = decision.structured.test_command;
    if (!command) {
      throw new Error("Missing test_command in Decision; rejecting unsafe execution.");
    }
    if (command === "FAIL_ME") {
      throw new Error("Simulated terminal failure");
    }
    return command;
  }

  private buildRequest(command: string, ctx: { intentId: string; runId: string }): SBXReq {
    return {
      envRef: "local-node-24",
      cmd: command,
      filesIn: [],
      env: {},
      timeoutMs: 30000,
      limits: { cpu: 1, memMB: 512 },
      net: false,
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
  ): Promise<{ result: SBXRes; request: SBXReq }> {
    const cfg = getConfig();

    if (cfg.chaosSleepExecuteMs > 0) {
      console.log(`[Chaos] Sleeping for ${cfg.chaosSleepExecuteMs}ms in ExecuteST...`);
      await new Promise((resolve) => setTimeout(resolve, cfg.chaosSleepExecuteMs));
    }
    const command = this.resolveCommand(decision);
    const sbxReq = this.buildRequest(command, ctx);

    const result = await runSandboxJob(sbxReq, cfg.sbxMode);
    return { result, request: sbxReq };
  }
}
