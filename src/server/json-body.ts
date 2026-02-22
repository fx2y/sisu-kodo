import { ValidationError } from "../contracts/assert";

export function parseJsonBody(rawBody: string): unknown {
  if (rawBody.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ValidationError([], "invalid json");
  }
}
