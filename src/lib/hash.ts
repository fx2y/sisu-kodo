import { createHash } from "node:crypto";

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function toJsonValue(value: unknown): JsonValue {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error("sha256 input is not JSON-serializable");
  }
  return JSON.parse(json) as JsonValue;
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((entry) => canonicalize(entry)).join(",") + "]";
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return (
    "{" +
    entries.map(([key, entry]) => JSON.stringify(key) + ":" + canonicalize(entry)).join(",") +
    "}"
  );
}

/**
 * Returns a stable, canonical JSON string representation of the object.
 * Keys are sorted lexicographically.
 */
export function canonicalStringify(value: unknown): string {
  return canonicalize(toJsonValue(value));
}

/**
 * Returns a SHA-256 hex digest of the input string or object.
 * Objects are stringified canonically.
 */
export function sha256(content: unknown): string {
  const data = typeof content === "string" ? content : canonicalStringify(content);
  return createHash("sha256").update(data).digest("hex");
}
