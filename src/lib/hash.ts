import { createHash } from "node:crypto";

/**
 * Returns a SHA-256 hex digest of the input string or object.
 */
export function sha256(content: string | Record<string, unknown>): string {
  const data = typeof content === "string" ? content : JSON.stringify(content);
  return createHash("sha256").update(data).digest("hex");
}
