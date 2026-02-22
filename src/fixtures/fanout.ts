import { sha256 } from "../lib/hash";
import type { RecipeFixture, RecipeRef } from "../contracts/recipe.schema";
import type { EvalCheckResult } from "../contracts/eval.schema";
import { computeFlakeHash } from "../eval/runner";

export type FixtureEval = {
  fixtureId: string;
  ok: boolean;
  eval: EvalCheckResult[];
};

export type FixtureRunHandle = {
  workflowID: string;
  getResult(): Promise<FixtureEval>;
};

export type StartFixtureWorkflow = (
  recipeRef: RecipeRef,
  fixture: RecipeFixture,
  workflowId: string
) => Promise<FixtureRunHandle>;

export function buildFixtureWorkflowId(recipeRef: RecipeRef, fixtureId: string): string {
  return sha256({
    recipeId: recipeRef.id,
    recipeV: recipeRef.v,
    fixtureId
  });
}

export async function runFixturesFanout(
  recipeRef: RecipeRef,
  fixtures: RecipeFixture[],
  startFixture: StartFixtureWorkflow
): Promise<FixtureEval[]> {
  const ordered = [...fixtures].sort((a, b) => a.id.localeCompare(b.id));
  const handles = await Promise.all(
    ordered.map((fixture) =>
      startFixture(recipeRef, fixture, buildFixtureWorkflowId(recipeRef, fixture.id))
    )
  );
  const results = await Promise.all(handles.map((handle) => handle.getResult()));
  return results.sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
}

export function assertNoFlake(
  first: ReadonlyArray<FixtureEval>,
  second: ReadonlyArray<FixtureEval>
): { stable: boolean; hashA: string; hashB: string } {
  const hashA = computeFlakeHash(first);
  const hashB = computeFlakeHash(second);
  return { stable: hashA === hashB, hashA, hashB };
}
