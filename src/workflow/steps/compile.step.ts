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

  async execute(
    intent: Intent,
    context: { runId: string; attempt: number }
  ): Promise<CompiledIntent> {
    // We establish the session here too if it's the first step
    const sessionId = await this.oc.createSession(context.runId, context.runId);
    
    // Future: call OC to compile structured intent
    // For now, still passthrough but with session/log established
    await this.oc.log(`Compiling intent for run ${context.runId}`);

    return {
      goal: intent.goal,
      inputs: intent.inputs,
      constraints: intent.constraints,
      timestamp: nowIso()
    };
  }
}
