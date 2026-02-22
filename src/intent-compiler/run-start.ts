import { ValidationError } from "../contracts/assert";

export type LegacyRunStartPayload = {
  intentId: string;
  runRequest: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value));
}

export function parseLegacyRunStartPayload(payload: unknown): LegacyRunStartPayload {
  const payloadObj = asRecord(payload);
  if (!payloadObj) {
    throw new ValidationError([], "invalid json payload");
  }

  const rawIntentId = payloadObj.intentId;
  if (typeof rawIntentId !== "string" || rawIntentId.length === 0) {
    throw new ValidationError([], "intentId required");
  }

  const { intentId: _ignored, ...runRequest } = payloadObj;
  return { intentId: rawIntentId, runRequest };
}
