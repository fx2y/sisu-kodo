import type { Intent } from "../../contracts/intent.schema";
import type { OCClientPort } from "../../oc/port";
import { PlanSchema } from "../../contracts/oc/plan.schema";
import type { CompiledIntent } from "./compile.types";
import { StructuredOutputError } from "../../contracts/error";
import { insertArtifact } from "../../db/artifactRepo";
import { getPool } from "../../db/pool";

export type { CompiledIntent };

export class CompileStepImpl {
  constructor(private readonly oc: OCClientPort) {}

  async execute(
    intent: Intent,
    context: { runId: string; attempt: number }
  ): Promise<CompiledIntent> {
    const sessionId = await this.oc.createSession(context.runId, context.runId);

    await this.oc.log(`Planning for run ${context.runId}`);

    const prompt = `Goal: ${intent.goal}
Inputs: ${JSON.stringify(intent.inputs)}
Constraints: ${JSON.stringify(intent.constraints)}

Return ONLY JSON per schema. No code, no patches.
`;
    const producer = async (): Promise<{
      prompt: string;
      toolcalls: [];
      responses: [];
      diffs: [];
      structured: Omit<CompiledIntent, "goal">;
    }> => ({
      prompt,
      toolcalls: [],
      responses: [],
      diffs: [],
      structured: {
        design: [`Design for: ${intent.goal}`],
        files: [],
        risks: [],
        tests: []
      }
    });

    try {
      const result = await this.oc.promptStructured(
        sessionId,
        prompt,
        PlanSchema as unknown as Record<string, unknown>,
        {
          agent: "plan",
          runId: context.runId,
          stepId: "CompileST",
          attempt: context.attempt,
          retryCount: 3,
          producer
        }
      );

      if (!result.structured) {
        throw new Error("No structured output returned from planner");
      }

      const plan = {
        goal: intent.goal,
        ...(result.structured as Omit<CompiledIntent, "goal">)
      } as CompiledIntent;

      // Persist plan as artifact
      await insertArtifact(getPool(), context.runId, "CompileST", 0, {
        kind: "plan_card",
        uri: `runs/${context.runId}/steps/CompileST/plan.json`,
        inline: plan as unknown as Record<string, unknown>,
        sha256: "plan"
      });

      return plan;
    } catch (err: unknown) {
      if (err instanceof StructuredOutputError) {
        // Persist diagnostic artifact
        await insertArtifact(getPool(), context.runId, "CompileST", 999, {
          kind: "json_diagnostic",
          uri: `runs/${context.runId}/steps/CompileST/diagnostic.json`,
          inline: {
            attempts: err.attempts,
            raw: err.raw as Record<string, unknown>,
            schemaHash: err.schemaHash,
            prompt: prompt
          },
          sha256: "diagnostic"
        });
      }
      throw err;
    }
  }
}
