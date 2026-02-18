import { createHash } from "node:crypto";

export function createOpKey(params: {
  runId: string;
  stepId: string;
  attempt: number;
  schemaHash: string;
  promptHash: string;
}): string {
  const raw = `${params.runId}:${params.stepId}:${params.attempt}:${params.schemaHash}:${params.promptHash}`;
  return createHash("sha256").update(raw).digest("hex");
}
