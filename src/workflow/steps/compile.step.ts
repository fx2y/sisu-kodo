import type { Intent } from "../../contracts/intent.schema";
import { nowIso } from "../../lib/time";

export type CompiledIntent = {
  goal: string;
  inputs: Record<string, unknown>;
  constraints: Record<string, unknown>;
  timestamp: string;
};

export class CompileStepImpl {
  async execute(intent: Intent): Promise<CompiledIntent> {
    return {
      goal: intent.goal,
      inputs: intent.inputs,
      constraints: intent.constraints,
      timestamp: nowIso()
    };
  }
}
