import type { Decision } from "./decide.step";
import type { SandboxResult } from "../../sbx/runner";
import { runSandboxJob } from "../../sbx/runner";
import { getConfig } from "../../config";

export type ExecutionResult = SandboxResult;

export class ExecuteStepImpl {
  async execute(decision: Decision): Promise<ExecutionResult> {
    const cfg = getConfig();

    if (cfg.chaosSleepExecuteMs > 0) {
      console.log(`[Chaos] Sleeping for ${cfg.chaosSleepExecuteMs}ms in ExecuteST...`);
      await new Promise((resolve) => setTimeout(resolve, cfg.chaosSleepExecuteMs));
    }

    // For now: assume only one toolcall for demo/simplicity
    const command = decision.toolcalls?.[0]?.args?.cmd as string | undefined;

    if (command === "FAIL_ME") {
      throw new Error("Simulated terminal failure");
    }

    return await runSandboxJob({
      mode: cfg.sbxMode,
      command: command ?? "ls"
    });
  }
}
