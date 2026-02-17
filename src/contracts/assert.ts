import { ajv } from "./ajv";
import type { ErrorObject, ValidateFunction } from "ajv";

export class ValidationError extends Error {
  public constructor(
    public readonly errors: ErrorObject[],
    message: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function assertValid<T>(
  validate: ValidateFunction<T>,
  value: unknown,
  context: string
): asserts value is T {
  if (validate(value)) return;
  const reason = ajv.errorsText(validate.errors, { separator: "; " });
  throw new ValidationError(validate.errors ?? [], `invalid ${context}: ${reason}`);
}

export function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}
