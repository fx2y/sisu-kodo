import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Pool } from "pg";
import { closePool, createPool } from "../../src/db/pool";
import { insertVersion, promoteStable, setCandidate } from "../../src/db/recipeRepo";

describe("recipe stable immutability", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  test("cannot overwrite stable recipe version", async () => {
    const id = `rcp_stable_${Date.now()}`;
    const v = "1.0.0";
    const recipe = {
      id,
      v,
      name: "Stable Recipe",
      tags: ["test"],
      formSchema: { type: "object", additionalProperties: false, properties: {} },
      intentTmpl: { goal: "stable" },
      wfEntry: "Runner.runIntent",
      queue: "intentQ" as const,
      limits: { maxSteps: 10, maxFanout: 5, maxSbxMin: 2, maxTokens: 1000 },
      eval: [{ id: "exists", kind: "file_exists" as const, glob: "artifacts/*.json" }],
      fixtures: [{ id: "fx1", formData: { x: 1 } }],
      prompts: { compile: "compile", postmortem: "postmortem" }
    };
    await insertVersion(pool, recipe, "draft");
    await setCandidate(pool, id, v);
    await promoteStable(pool, id, v);

    await expect(insertVersion(pool, { ...recipe, name: "mutated" }, "draft")).rejects.toThrow(
      /immutable/
    );
  });
});
