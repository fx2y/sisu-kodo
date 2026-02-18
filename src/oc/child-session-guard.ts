import { WorkflowError } from "../contracts/error";

const FORBIDDEN_KEYS = new Set(["parentid", "parentsessionid"]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findForbiddenKey(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findForbiddenKey(item, seen);
      if (nested) return nested;
    }
    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(normalizeKey(key))) {
      return key;
    }
    const found = findForbiddenKey(nested, seen);
    if (found) return found;
  }
  return undefined;
}

export function assertNoChildSession(value: unknown): void {
  const forbiddenKey = findForbiddenKey(value);
  if (!forbiddenKey) return;
  throw new WorkflowError(
    "child_session_denied",
    `Forbidden child-session field detected: ${forbiddenKey}`
  );
}
