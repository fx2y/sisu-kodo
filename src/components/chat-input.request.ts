import type { RunStartRequest } from "@src/contracts/run-start.schema";

export const DEFAULT_UI_QUEUE_PARTITION_KEY = "ui-default";
export const UI_DEFAULT_RECIPE_ID = "compile-default";
export const UI_DEFAULT_RECIPE_V = "v1";

export function buildChatRunStartRequest(
  goal: string,
  queuePartitionKey: string = DEFAULT_UI_QUEUE_PARTITION_KEY
): RunStartRequest {
  if (!goal.trim()) {
    throw new Error("goal is required");
  }

  return {
    recipeRef: {
      id: UI_DEFAULT_RECIPE_ID,
      v: UI_DEFAULT_RECIPE_V
    },
    formData: {
      goal
    },
    opts: {
      queuePartitionKey,
      lane: "interactive"
    }
  };
}
