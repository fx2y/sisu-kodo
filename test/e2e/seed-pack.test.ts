import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { assertRecipeBundle, type RecipeBundle } from "../../src/contracts/recipe.schema";
import { instantiateIntent } from "../../src/intent-compiler/instantiate-intent";
import { evaluateChecks } from "../../src/eval/runner";
import type { ArtifactIndex } from "../../src/contracts/sbx/artifact-index.schema";

function loadSeedBundle(): RecipeBundle {
  const raw = readFileSync("fixtures/seed-pack/bundle.v1.json", "utf8");
  const parsed = JSON.parse(raw) as unknown;
  assertRecipeBundle(parsed);
  return parsed;
}

describe("seed pack", () => {
  test("contains 10 data-only recipes with fixtures/eval and canonical step library", () => {
    const bundle = loadSeedBundle();
    expect(bundle.versions).toHaveLength(10);

    for (const recipe of bundle.versions) {
      expect(recipe.fixtures.length).toBeGreaterThanOrEqual(1);
      expect(recipe.fixtures.length).toBeLessThanOrEqual(3);
      expect(recipe.eval.length).toBeGreaterThanOrEqual(1);

      const intent = instantiateIntent(recipe, recipe.fixtures[0]?.formData ?? {});
      const constraints = intent.constraints as {
        stepLibrary?: { primitives?: string[] };
      };
      expect(constraints.stepLibrary?.primitives).toEqual([
        "Collect",
        "Fetch",
        "Extract",
        "Normalize",
        "Decide",
        "Act",
        "Report"
      ]);
    }
  });

  test("all seed recipe eval checks pass for canonical artifact+report tuple", () => {
    const bundle = loadSeedBundle();
    for (const recipe of bundle.versions) {
      const runId = `seed_${recipe.id.replace(/\W+/g, "_")}`;
      const reportUri = `artifact://run/${runId}/step/ExecuteST/task/t1/files/out.json`;
      const index: ArtifactIndex = {
        taskKey: "t1",
        provider: "mock",
        items: [{ kind: "file", uri: reportUri, sha256: "seed" }],
        rawRef: `artifact://run/${runId}/step/ExecuteST/task/t1/raw.json`,
        createdAt: "1970-01-01T00:00:00.000Z"
      };
      const artifacts = new Map([[reportUri, { uri: reportUri, inline: { ok: true }, sha256: "seed" }]]);
      const results = evaluateChecks(recipe.eval, index, artifacts);
      expect(results.every((r) => r.pass)).toBe(true);
    }
  });
});

