import { sha256 } from "../../lib/hash";
import { LEGACY_HITL_GATE_KEY, normalizeHitlGateKey } from "../../lib/hitl-topic";

export type LegacyHitlDedupeOrigin = "legacy-approve" | "legacy-event";

export type BuildLegacyHitlDedupeKeyInput = {
  origin: LegacyHitlDedupeOrigin;
  workflowId: string;
  runId?: string;
  gateKey?: string;
  topic: string;
  payload: unknown;
};

function resolveGateKey(topic: string, gateKey?: string): string {
  if (gateKey && gateKey.length > 0) {
    return normalizeHitlGateKey(gateKey);
  }
  if (topic.startsWith("human:")) {
    return normalizeHitlGateKey(topic.slice("human:".length));
  }
  return LEGACY_HITL_GATE_KEY;
}

export function buildLegacyHitlDedupeKey(input: BuildLegacyHitlDedupeKeyInput): string {
  const payloadHash = sha256(input.payload);
  const canonical = {
    origin: input.origin,
    workflowId: input.workflowId,
    runId: input.runId ?? "",
    gateKey: resolveGateKey(input.topic, input.gateKey),
    topic: input.topic,
    payloadHash
  };

  return `${input.origin}:${sha256(canonical)}`;
}
