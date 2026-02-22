import { readFileSync, writeFileSync } from "node:fs";
import type { Pool } from "pg";

import { sha256 } from "../../lib/hash";
import {
  findPatchHistory,
  insertPatchHistory,
  markPatchApplied,
  markPatchRolledBack
} from "../../db/patchHistoryRepo";

export type ReversiblePatchInput = {
  runId: string;
  stepId: string;
  patchIndex: number;
  targetPath: string;
  postimageContent: string;
  diffText: string;
};

function readUtf8(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export async function applyReversiblePatch(
  pool: Pool,
  input: ReversiblePatchInput
): Promise<{ preimageHash: string; postimageHash: string; diffHash: string }> {
  const preimageContent = readUtf8(input.targetPath);
  const preimageHash = sha256(preimageContent);
  const postimageHash = sha256(input.postimageContent);
  const diffHash = sha256(input.diffText);

  const row = await insertPatchHistory(pool, {
    runId: input.runId,
    stepId: input.stepId,
    patchIndex: input.patchIndex,
    targetPath: input.targetPath,
    preimageHash,
    postimageHash,
    diffHash,
    preimageContent,
    postimageContent: input.postimageContent
  });

  const currentHash = sha256(readUtf8(input.targetPath));
  if (currentHash === row.postimage_hash) {
    // Idempotent replay after crash/retry: postimage already present.
    await markPatchApplied(pool, input.runId, input.stepId, input.patchIndex);
    return { preimageHash: row.preimage_hash, postimageHash: row.postimage_hash, diffHash };
  }

  if (currentHash !== row.preimage_hash) {
    throw new Error(`PREIMAGE_MISMATCH:${input.targetPath}`);
  }

  writeFileSync(input.targetPath, row.postimage_content, "utf8");
  await markPatchApplied(pool, input.runId, input.stepId, input.patchIndex);
  return { preimageHash, postimageHash, diffHash };
}

export async function rollbackReversiblePatch(
  pool: Pool,
  runId: string,
  stepId: string,
  patchIndex: number
): Promise<void> {
  const row = await findPatchHistory(pool, runId, stepId, patchIndex);
  if (!row) {
    throw new Error(`PATCH_HISTORY_NOT_FOUND:${runId}:${stepId}:${String(patchIndex)}`);
  }

  const currentHash = sha256(readUtf8(row.target_path));
  if (currentHash === row.preimage_hash) {
    // Idempotent replay: already rolled back.
    await markPatchRolledBack(pool, runId, stepId, patchIndex);
    return;
  }

  if (currentHash !== row.postimage_hash) {
    throw new Error(`POSTIMAGE_MISMATCH:${row.target_path}`);
  }

  writeFileSync(row.target_path, row.preimage_content, "utf8");
  await markPatchRolledBack(pool, runId, stepId, patchIndex);
}
