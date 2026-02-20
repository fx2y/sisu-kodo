import { assertHitlGateKey, normalizeHitlGateKey } from "../../lib/hitl-topic";

function normalizedGate(gateKey: string): string {
  const normalized = normalizeHitlGateKey(gateKey);
  assertHitlGateKey(normalized);
  return normalized;
}

export function toHitlPromptKey(gateKey: string): string {
  return `ui:${normalizedGate(gateKey)}`;
}

export function toHitlResultKey(gateKey: string): string {
  return `ui:${normalizedGate(gateKey)}:result`;
}

export function toHitlDecisionKey(gateKey: string): string {
  return `decision:${normalizedGate(gateKey)}`;
}

export function toHitlAuditKey(gateKey: string): string {
  return `ui:${normalizedGate(gateKey)}:audit`;
}
