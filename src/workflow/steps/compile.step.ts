import type { Intent } from "../../contracts/intent.schema";
import { nowIso } from "../../lib/time";
import type { OCClientPort } from "../../oc/port";

export type CompiledIntent = {
  goal: string;
  inputs: Record<string, unknown>;
  constraints: Record<string, unknown>;
  timestamp: string;
};

export class CompileStepImpl {
  constructor(private readonly oc: OCClientPort) {}

  async execute(intent: Intent): Promise<CompiledIntent> {
    // Current placeholder doesn't call OC, but seam is established
    return {
      goal: intent.goal,
      inputs: intent.inputs,
      constraints: intent.constraints,
      timestamp: nowIso()
    };
  }
}
