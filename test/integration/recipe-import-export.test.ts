import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Pool } from "pg";
import { closePool, createPool } from "../../src/db/pool";
import {
  exportBundle,
  importBundle,
  insertVersion,
  promoteStable,
  setCandidate
} from "../../src/db/recipeRepo";
import { canonicalStringify, sha256 } from "../../src/lib/hash";

function mkRecipe(id: string, v: string, suffix: string) {
  return {
    id,
    v,
    name: `Recipe ${suffix}`,
    tags: ["seed"],
    formSchema: { type: "object", additionalProperties: false, properties: {} },
    intentTmpl: { goal: `hello ${suffix}` },
    wfEntry: "Runner.runIntent",
    queue: "intentQ" as const,
    limits: { maxSteps: 10, maxFanout: 5, maxSbxMin: 2, maxTokens: 1000 },
    eval: [{ id: "exists", kind: "file_exists" as const, glob: "artifacts/*.json" }],
    fixtures: [{ id: "fx1", formData: { x: 1 } }],
    prompts: { compile: "compile", postmortem: "postmortem" }
  };
}

describe("recipe import/export", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  test("import/export roundtrip stays canonical", async () => {
    const id = `rcp_roundtrip_${Date.now()}`;
    const bundle = { id, versions: [mkRecipe(id, "1.0.0", "a"), mkRecipe(id, "1.0.1", "b")] };
    const imported = await importBundle(pool, bundle);

    expect(imported).toHaveLength(2);
    expect(imported[0].hash).toBe(sha256(canonicalStringify(bundle.versions[0])));
    expect(imported[1].hash).toBe(sha256(canonicalStringify(bundle.versions[1])));

    const exported = await exportBundle(pool, id);
    expect(canonicalStringify(exported)).toBe(canonicalStringify(bundle));
  });

  test("stable version is immutable", async () => {
    const id = `rcp_immut_${Date.now()}`;
    const v = "2.0.0";
    await insertVersion(pool, mkRecipe(id, v, "orig"), "draft");
    expect(await setCandidate(pool, id, v)).toBe(true);
    expect(await promoteStable(pool, id, v)).toBe(true);

    await expect(
      insertVersion(pool, { ...mkRecipe(id, v, "changed"), name: "Changed Stable" }, "draft")
    ).rejects.toThrow(/immutable/);
  });
});
