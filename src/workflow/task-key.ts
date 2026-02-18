import { sha256 } from "../lib/hash";

export type TaskKeyInput = {
  intentId: string;
  runId: string;
  stepId: string;
  normalizedReq: unknown;
};

/**
 * Generates a stable taskKey for deduplication and caching.
 * Input includes intentId, runId, stepId, and the normalized request.
 */
export function buildTaskKey(input: TaskKeyInput): string {
  return sha256(input);
}
