import type { PatchedIntent } from "./apply-patch.step";
import type { OCOutput } from "../../oc/schema";
import { assertOCOutput } from "../../oc/schema";

export type Decision = OCOutput;
export type OpencodeCallEnvelope = {
  request: Record<string, unknown>;
  response: Decision;
  diff: Record<string, unknown> | null;
};

export class DecideStepImpl {
  async execute(
    patched: PatchedIntent
  ): Promise<{ decision: Decision; envelope: OpencodeCallEnvelope }> {
    // Canonical placeholder: in reality this calls LLM/OC
    let cmd = "ls";
    if (patched.goal.includes("fail me")) {
      cmd = "FAIL_ME";
    } else if (patched.goal.includes("sleep")) {
      const match = patched.goal.match(/sleep (\d+)/);
      const seconds = match ? parseInt(match[1], 10) : 10;
      cmd = `sleep ${seconds}`;
    }

    const output: OCOutput = {
      prompt: `Execute goal: ${patched.goal}`,
      toolcalls: [{ name: "bash", args: { cmd } }],
      responses: [],
      diffs: []
    };

    assertOCOutput(output);
    return {
      decision: output,
      envelope: {
        request: {
          goal: patched.goal,
          inputs: patched.inputs,
          constraints: patched.constraints
        },
        response: output,
        diff: output.diffs.length > 0 ? { diffs: output.diffs } : null
      }
    };
  }
}
