import type { Decision } from "./decide.step";
import type { SandboxResult } from "../../sbx/runner";
import { runSandboxJob } from "../../sbx/runner";
import { getConfig } from "../../config";
import { assertBuildOutput } from "../../contracts/oc/build.schema";

export type ExecutionResult = SandboxResult;

export class ExecuteStepImpl {
  async execute(decision: Decision): Promise<ExecutionResult> {
    const cfg = getConfig();

    if (cfg.chaosSleepExecuteMs > 0) {
      console.log(`[Chaos] Sleeping for ${cfg.chaosSleepExecuteMs}ms in ExecuteST...`);
      await new Promise((resolve) => setTimeout(resolve, cfg.chaosSleepExecuteMs));
    }

    // Use test_command from structured output
    assertBuildOutput(decision.structured);
    const buildOutput = decision.structured;
    const command = buildOutput.test_command;

    if (!command) {
      throw new Error("Missing test_command in Decision; rejecting unsafe execution.");
    }

    if (command === "FAIL_ME") {
      throw new Error("Simulated terminal failure");
    }

    return await runSandboxJob({
      mode: cfg.sbxMode,
      command
    });
  }
}
