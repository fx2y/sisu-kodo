import { DBOS } from "@dbos-inc/dbos-sdk";
import type { RecipeFixture, RecipeRef } from "../../contracts/recipe.schema";
import type { FixtureEval } from "../../fixtures/fanout";

@DBOS.className("FixtureWorkflow")
export class FixtureWorkflow {
  @DBOS.workflow()
  static async run(
    _recipeRef: RecipeRef,
    fixture: RecipeFixture,
    forced?: FixtureEval
  ): Promise<FixtureEval> {
    if (forced) return forced;
    return {
      fixtureId: fixture.id,
      ok: true,
      eval: []
    };
  }
}
