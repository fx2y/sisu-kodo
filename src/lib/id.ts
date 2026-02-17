import { rand } from "./rng";

/**
 * Generates a deterministic hex string of given length using the current RNG seed.
 */
export function generateId(prefix: string, length = 16): string {
  let res = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < length; i++) {
    res += chars[Math.floor(rand() * chars.length)];
  }
  return `${prefix}_${res}`;
}
