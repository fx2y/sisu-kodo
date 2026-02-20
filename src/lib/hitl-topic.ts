const HITL_GATE_KEY_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/;
const HITL_TOPIC_PATTERN = /^(human|sys):[a-z0-9][a-z0-9:_-]{0,127}$/;

export const LEGACY_HITL_GATE_KEY = "legacy-event";
export const LEGACY_HITL_TOPIC = `human:${LEGACY_HITL_GATE_KEY}`;

function toNormalizedSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:_-]/g, "-")
    .replace(/-+/g, "-");
}

export function normalizeHitlGateKey(rawGateKey: string): string {
  const normalized = toNormalizedSlug(rawGateKey);
  if (!HITL_GATE_KEY_PATTERN.test(normalized)) {
    throw new Error(`invalid HITL gateKey: ${rawGateKey}`);
  }
  return normalized;
}

export function assertHitlGateKey(value: string): void {
  if (!HITL_GATE_KEY_PATTERN.test(value)) {
    throw new Error(`invalid HITL gateKey: ${value}`);
  }
}

export function toHumanTopic(gateKey: string): string {
  const normalizedGateKey = normalizeHitlGateKey(gateKey);
  return `human:${normalizedGateKey}`;
}

export function toSystemTopic(topicKey: string): string {
  const normalizedTopicKey = normalizeHitlGateKey(topicKey);
  return `sys:${normalizedTopicKey}`;
}

export function assertHitlTopic(topic: string): void {
  if (!HITL_TOPIC_PATTERN.test(topic)) {
    throw new Error(`invalid HITL topic: ${topic}`);
  }
}
