export const DEFAULT_UI_QUEUE_PARTITION_KEY = "ui-default";
export const UI_DEFAULT_RECIPE_NAME = "compile-default";

export type ChatRunRequest = {
  intentId: string;
  recipeName: string;
  queuePartitionKey: string;
};

export function buildChatRunRequest(
  intentId: string,
  queuePartitionKey: string = DEFAULT_UI_QUEUE_PARTITION_KEY
): ChatRunRequest {
  if (!intentId.trim()) {
    throw new Error("intentId is required");
  }
  if (!queuePartitionKey.trim()) {
    throw new Error("queuePartitionKey is required");
  }

  return {
    intentId,
    recipeName: UI_DEFAULT_RECIPE_NAME,
    queuePartitionKey
  };
}
