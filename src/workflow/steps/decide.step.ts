import type { PatchedIntent } from "./apply-patch.step";
import type { OCOutput } from "../../oc/schema";
import { assertOCOutput } from "../../oc/schema";
import type { OCClientPort } from "../../oc/port";

export type Decision = OCOutput;
export type OpencodeCallEnvelope = {
  request: Record<string, unknown>;
  response: Decision;
  diff: Record<string, unknown> | null;
};

export class DecideStepImpl {
  constructor(private readonly oc: OCClientPort) {}

  async execute(
    patched: PatchedIntent
  ): Promise<{ decision: Decision; envelope: OpencodeCallEnvelope }> {
    const producer = async (): Promise<OCOutput> => {
      // Canonical placeholder: in reality this calls LLM/OC
      let cmd = "ls";
      if (patched.goal.includes("fail me")) {
        cmd = "FAIL_ME";
      } else if (patched.goal.includes("sleep")) {
        const match = patched.goal.match(/sleep (\d+)/);
        const seconds = match ? parseInt(match[1], 10) : 10;
        cmd = `sleep ${seconds}`;
      }

      return {
        prompt: `Execute goal: ${patched.goal}`,
        toolcalls: [{ name: "bash", args: { cmd } }],
        responses: [],
        diffs: []
      };
    };

    const { payload: output } = await this.oc.run({
      intent: patched.goal,
      schemaVersion: 1,
      seed: "fixed-seed", // TODO: use deterministic seed from run context
      producer
    });

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
