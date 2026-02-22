import type { PatchedIntent } from "./apply-patch.step";
import type { OCOutput } from "../../oc/schema";
import type { OCClientPort } from "../../oc/port";
import { BuildSchema, assertBuildOutput } from "../../contracts/oc/build.schema";
import { insertArtifact } from "../../db/artifactRepo";
import { getPool } from "../../db/pool";
import { sha256 } from "../../lib/hash";
import { buildArtifactUri } from "../../lib/artifact-uri";

export type Decision = OCOutput;
export type OpencodeCallEnvelope = {
  request: Record<string, unknown>;
  response: Decision;
  diff: Record<string, unknown> | null;
};

export class DecideStepImpl {
  constructor(private readonly oc: OCClientPort) {}

  async execute(
    patched: PatchedIntent,
    context: { runId: string; attempt: number }
  ): Promise<{ decision: Decision; envelope: OpencodeCallEnvelope }> {
    const sessionId = await this.oc.createSession(context.runId, context.runId);

    const prompt = `Approved Plan: ${JSON.stringify({
      design: patched.design,
      files: patched.files,
      risks: patched.risks,
      tests: patched.tests
    })}

Goal: ${patched.goal}

Generate patches and test command. Return ONLY JSON per schema.
`;

    const producer = async (): Promise<OCOutput> => {
      return {
        prompt,
        toolcalls: [],
        responses: [],
        diffs: [],
        structured: {
          patch: [],
          tests: patched.tests,
          test_command: "pnpm test"
        }
      };
    };

    const output = await this.oc.promptStructured(
      sessionId,
      prompt,
      BuildSchema as unknown as Record<string, unknown>,
      {
        agent: "build",
        runId: context.runId,
        stepId: "DecideST",
        attempt: context.attempt,
        retryCount: 3,
        producer
      }
    );

    assertBuildOutput(output.structured);
    const buildOutput = output.structured;

    // Persist patches as artifacts
    for (let i = 0; i < buildOutput.patch.length; i++) {
      const p = buildOutput.patch[i];
      const content = { path: p.path, diff: p.diff };
      await insertArtifact(
        getPool(),
        context.runId,
        "DecideST",
        i,
        {
          kind: "patch",
          uri: buildArtifactUri({
            runId: context.runId,
            stepId: "DecideST",
            taskKey: "",
            name: `${p.path}.patch`
          }),
          inline: content,
          sha256: sha256(content)
        },
        "",
        context.attempt
      ); // Use default task_key for non-SBX artifacts
    }

    return {
      decision: output,
      envelope: {
        request: {
          goal: patched.goal,
          plan: {
            design: patched.design,
            files: patched.files
          }
        },
        response: output,
        diff: output.diffs.length > 0 ? { diffs: output.diffs } : null
      }
    };
  }
}
