import type { Pool } from "pg";

import { nowIso } from "../lib/time";

export type PatchHistoryRow = {
  run_id: string;
  step_id: string;
  patch_index: number;
  target_path: string;
  preimage_hash: string;
  postimage_hash: string;
  diff_hash: string;
  preimage_content: string;
  postimage_content: string;
  applied_at: Date | null;
  rolled_back_at: Date | null;
  created_at: Date;
};

export type InsertPatchHistoryInput = {
  runId: string;
  stepId: string;
  patchIndex: number;
  targetPath: string;
  preimageHash: string;
  postimageHash: string;
  diffHash: string;
  preimageContent: string;
  postimageContent: string;
};

export async function insertPatchHistory(
  pool: Pool,
  input: InsertPatchHistoryInput
): Promise<PatchHistoryRow> {
  const res = await pool.query<PatchHistoryRow>(
    `INSERT INTO app.patch_history (
       run_id, step_id, patch_index, target_path, preimage_hash, postimage_hash, diff_hash, preimage_content, postimage_content
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (run_id, step_id, patch_index) DO NOTHING
     RETURNING run_id, step_id, patch_index, target_path, preimage_hash, postimage_hash, diff_hash, preimage_content, postimage_content, applied_at, rolled_back_at, created_at`,
    [
      input.runId,
      input.stepId,
      input.patchIndex,
      input.targetPath,
      input.preimageHash,
      input.postimageHash,
      input.diffHash,
      input.preimageContent,
      input.postimageContent
    ]
  );

  if ((res.rowCount ?? 0) === 1) return res.rows[0];

  const existing = await findPatchHistory(pool, input.runId, input.stepId, input.patchIndex);
  if (!existing) {
    throw new Error(
      `patch history write lost for ${input.runId}:${input.stepId}:${String(input.patchIndex)}`
    );
  }
  return existing;
}

export async function findPatchHistory(
  pool: Pool,
  runId: string,
  stepId: string,
  patchIndex: number
): Promise<PatchHistoryRow | null> {
  const res = await pool.query<PatchHistoryRow>(
    `SELECT run_id, step_id, patch_index, target_path, preimage_hash, postimage_hash, diff_hash, preimage_content, postimage_content, applied_at, rolled_back_at, created_at
     FROM app.patch_history
     WHERE run_id = $1 AND step_id = $2 AND patch_index = $3`,
    [runId, stepId, patchIndex]
  );
  return (res.rowCount ?? 0) > 0 ? res.rows[0] : null;
}

export async function markPatchApplied(
  pool: Pool,
  runId: string,
  stepId: string,
  patchIndex: number
): Promise<void> {
  await pool.query(
    `UPDATE app.patch_history
     SET applied_at = COALESCE(applied_at, $4::timestamptz)
     WHERE run_id = $1 AND step_id = $2 AND patch_index = $3`,
    [runId, stepId, patchIndex, nowIso()]
  );
}

export async function markPatchRolledBack(
  pool: Pool,
  runId: string,
  stepId: string,
  patchIndex: number
): Promise<void> {
  await pool.query(
    `UPDATE app.patch_history
     SET rolled_back_at = COALESCE(rolled_back_at, $4::timestamptz)
     WHERE run_id = $1 AND step_id = $2 AND patch_index = $3`,
    [runId, stepId, patchIndex, nowIso()]
  );
}
