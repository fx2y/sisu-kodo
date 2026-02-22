import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";

import { closePool, createPool } from "../../src/db/pool";
import { findPatchHistory } from "../../src/db/patchHistoryRepo";
import { applyReversiblePatch, rollbackReversiblePatch } from "../../src/workflow/patch/reversible";
import { generateId } from "../../src/lib/id";

describe("patch rollback", () => {
  let pool: Pool;
  const tmpDir = resolve(".tmp", "patch-rollback");
  const targetPath = resolve(tmpDir, "recipe.json");

  beforeAll(() => {
    pool = createPool();
    mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    rmSync(tmpDir, { recursive: true, force: true });
    await pool.end();
    await closePool();
  });

  test("rollback restores exact preimage", async () => {
    const runId = generateId("run");
    const stepId = "ApplyPatchST";
    const patchIndex = 0;
    const pre = '{"id":"demo","v":"1.0.0"}\n';
    const post = '{"id":"demo","v":"1.0.1"}\n';
    writeFileSync(targetPath, pre, "utf8");

    await applyReversiblePatch(pool, {
      runId,
      stepId,
      patchIndex,
      targetPath,
      postimageContent: post,
      diffText: "@@ -1 +1 @@"
    });
    expect(readFileSync(targetPath, "utf8")).toBe(post);

    let row = await findPatchHistory(pool, runId, stepId, patchIndex);
    expect(row).not.toBeNull();
    expect(row?.applied_at).not.toBeNull();

    await rollbackReversiblePatch(pool, runId, stepId, patchIndex);
    expect(readFileSync(targetPath, "utf8")).toBe(pre);

    row = await findPatchHistory(pool, runId, stepId, patchIndex);
    expect(row?.rolled_back_at).not.toBeNull();
  });

  test("rollback fails closed on postimage mismatch", async () => {
    const runId = generateId("run");
    const stepId = "ApplyPatchST";
    const patchIndex = 1;
    writeFileSync(targetPath, "before\n", "utf8");

    await applyReversiblePatch(pool, {
      runId,
      stepId,
      patchIndex,
      targetPath,
      postimageContent: "after\n",
      diffText: "diff"
    });

    writeFileSync(targetPath, "tampered\n", "utf8");

    await expect(rollbackReversiblePatch(pool, runId, stepId, patchIndex)).rejects.toThrow(
      "POSTIMAGE_MISMATCH"
    );
  });
});
