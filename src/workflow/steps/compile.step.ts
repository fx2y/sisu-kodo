import type { Intent } from "../../contracts/intent.schema";
import type { OCClientPort } from "../../oc/port";
import { getConfig } from "../../config";
import { PlanSchema, assertPlanOutput } from "../../contracts/oc/plan.schema";
import type { CompiledIntent } from "./compile.types";
import { StructuredOutputError } from "../../contracts/error";
import { insertArtifact } from "../../db/artifactRepo";
import { getPool } from "../../db/pool";
import { sha256 } from "../../lib/hash";

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

      const plan: CompiledIntent = {
        goal: intent.goal,
        ...(result.structured as Omit<CompiledIntent, "goal">)
      };

      // Explicitly assert plan before artifact write (R06)
      assertPlanOutput(plan);

      // Persist plan as artifact
      await insertArtifact(getPool(), context.runId, "CompileST", 0, {
        kind: "plan_card",
        uri: `runs/${context.runId}/steps/CompileST/plan.json`,
        inline: plan as unknown as Record<string, unknown>,
        sha256: sha256(plan as unknown as Record<string, unknown>)
      });

      return plan;
    } catch (err: unknown) {
      if (err instanceof StructuredOutputError) {
        const diag = {
          attempts: err.attempts,
          raw: err.raw as Record<string, unknown>,
          schemaHash: err.schemaHash,
          prompt: prompt
        };
        // Persist diagnostic artifact
        await insertArtifact(getPool(), context.runId, "CompileST", 999, {
          kind: "json_diagnostic",
          uri: `runs/${context.runId}/steps/CompileST/diagnostic.json`,
          inline: diag,
          sha256: sha256(diag)
        });
      }
      throw err;
    }
  }
}
