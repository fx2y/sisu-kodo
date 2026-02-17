import type { Decision } from "./decide.step";
import type { SandboxResult } from "../../sbx/runner";
import { runSandboxJob } from "../../sbx/runner";

export type ExecutionResult = SandboxResult;

export class ExecuteStepImpl {
  async execute(decision: Decision): Promise<ExecutionResult> {
    // For now: assume only one toolcall for demo/simplicity
    const command = decision.toolcalls?.[0]?.args?.cmd as string | undefined;

    return await runSandboxJob({
      mode: "mock",
      command: command ?? "ls"
    });
  }
}
