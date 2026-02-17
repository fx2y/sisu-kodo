import type { PatchedIntent } from "./apply-patch.step";
import type { OCOutput } from "../../oc/schema";
import { assertOCOutput } from "../../oc/schema";

export type Decision = OCOutput;

export class DecideStepImpl {
  async execute(patched: PatchedIntent): Promise<Decision> {
    // Canonical placeholder: in reality this calls LLM/OC
    const output: OCOutput = {
      prompt: `Execute goal: ${patched.goal}`,
      toolcalls: [{ name: "bash", args: { cmd: "ls" } }],
      responses: [],
      diffs: []
    };

    assertOCOutput(output);
    return output;
  }
}
