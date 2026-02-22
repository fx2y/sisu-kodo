import type { CompiledIntent } from "./compile.types";
import { resolve } from "node:path";

import { getPool } from "../../db/pool";
import { insertArtifact } from "../../db/artifactRepo";
import { applyReversiblePatch } from "../patch/reversible";
import { buildArtifactUri } from "../../lib/artifact-uri";
import { sha256 } from "../../lib/hash";

export type PatchedIntent = CompiledIntent & {
  // Keep shape additive for compat, but do not emit wall-clock fields in replayed step outputs.
  patchedAt?: string;
};

type ApplyPatchContext = {
  runId: string;
  attempt: number;
};

function resolvePatchPathOrThrow(targetPath: string): string {
  const resolved = resolve(process.cwd(), targetPath);
  const tmpRoot = resolve(process.cwd(), ".tmp");
  if (!resolved.startsWith(`${tmpRoot}/`) && resolved !== tmpRoot) {
    throw new Error(`PATCH_PATH_NOT_ALLOWED:${targetPath}`);
  }
  return resolved;
}

export class ApplyPatchStepImpl {
  async execute(compiled: CompiledIntent, context: ApplyPatchContext): Promise<PatchedIntent> {
    const patchPlan = compiled.patchPlan ?? [];
    for (let i = 0; i < patchPlan.length; i++) {
      const item = patchPlan[i];
      const targetPath = resolvePatchPathOrThrow(item.targetPath);
      const hashes = await applyReversiblePatch(getPool(), {
        runId: context.runId,
        stepId: "ApplyPatchST",
        patchIndex: i,
        targetPath,
        postimageContent: item.postimageContent,
        diffText: item.diffText
      });
      const inline = {
        patchIndex: i,
        targetPath,
        preimageHash: hashes.preimageHash,
        postimageHash: hashes.postimageHash,
        diffHash: hashes.diffHash
      };
      await insertArtifact(
        getPool(),
        context.runId,
        "ApplyPatchST",
        i,
        {
          kind: "patch_apply",
          uri: buildArtifactUri({
            runId: context.runId,
            stepId: "ApplyPatchST",
            taskKey: "",
            name: `patch-${String(i)}.json`
          }),
          inline,
          sha256: sha256(inline)
        },
        "",
        context.attempt
      );
    }

    // Keep replay-compared output deterministic and schema-stable.
    return {
      goal: compiled.goal,
      design: compiled.design,
      files: compiled.files,
      risks: compiled.risks,
      tests: compiled.tests
    };
  }
}
