import { sha256 } from "../../lib/hash";
import { normalizeHitlGateKey } from "../../lib/hitl-topic";

/**
 * Deterministic gateKey builder from stable tuple.
 * (runId, stepId, purpose, attempt) ensures exactly one gate key per logical attempt/phase.
 */
export function buildGateKey(
  runId: string,
  stepId: string,
  purpose: string,
  attempt: number = 1
): string {
  const tuple = `${runId}:${stepId}:${purpose}:${attempt}`;
  const hash = sha256(tuple).substring(0, 16);
  // Human-readable prefix for debugging
  const prefix = purpose
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .substring(0, 16);
  return normalizeHitlGateKey(`${prefix}-${hash}`);
}
