export type RecipeRef = {
  name: string;
  version?: number;
};

export type RecipeLookup = {
  name: string;
  version: number;
  queue: string;
  maxConcurrency: number;
  maxSteps: number;
  maxSandboxMinutes: number;
};

export interface RecipeCatalogPort {
  findRecipe(ref: RecipeRef): Promise<RecipeLookup | null>;
}
