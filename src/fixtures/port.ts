export type FixtureRunResult = {
  fixtureId: string;
  runId: string;
  passed: boolean;
};

export interface FixturesRunnerPort {
  runRecipeFixtures(recipeName: string, version: number): Promise<FixtureRunResult[]>;
}
