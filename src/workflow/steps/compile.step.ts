import type { Intent } from "../../contracts/intent.schema";
import type { OCClientPort } from "../../oc/port";
import { CompilerSchema } from "../../contracts/oc/compiler.schema";
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
    
    await this.oc.log(`Compiling intent for run ${context.runId}`);

    const clamps = `HARD: touch<=10 files; diff<=20k chars/file; no renames; no refactor; must list tests.`;
    const prompt = `Goal: ${intent.goal}
Inputs: ${JSON.stringify(intent.inputs)}
Constraints: ${JSON.stringify(intent.constraints)}
${clamps}

Return ONLY JSON per schema.
`;

    try {
      const result = await this.oc.promptStructured(
        sessionId,
        prompt,
        CompilerSchema as unknown as Record<string, unknown>,
        {
          agent: "build",
          runId: context.runId,
          stepId: "CompileST",
          attempt: context.attempt,
          retryCount: 3
        }
      );

      if (!result.structured) {
        throw new Error("No structured output returned from compiler");
      }

      return result.structured as CompiledIntent;
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
