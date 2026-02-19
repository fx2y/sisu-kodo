import type { ServerResponse } from "node:http";
import { ValidationError } from "../contracts/assert";

export function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

export function handleValidationError(res: ServerResponse, error: unknown): boolean {
  if (error instanceof ValidationError) {
    json(res, 400, {
      error: error.message,
      details: error.errors
    });
    return true;
  }
  return false;
}

export function withValidation<T>(
  res: ServerResponse,
  assertFn: (val: unknown) => asserts val is T,
  payload: unknown,
  successCb: (val: T) => void
): void {
  try {
    assertFn(payload);
    successCb(payload);
  } catch (err) {
    if (!handleValidationError(res, err)) {
      throw err;
    }
  }
}

export function validateAndSend<T>(
  res: ServerResponse,
  assertFn: (val: unknown) => asserts val is T,
  payload: T,
  statusCode: number = 200
): void {
  try {
    assertFn(payload);
    json(res, statusCode, payload);
  } catch (err) {
    // Egress validation failure is a 500 because it means our projector is broken
    console.error("[Egress Validation Failed]", err);
    json(res, 500, { error: "internal server error: egress validation failed" });
  }
}
