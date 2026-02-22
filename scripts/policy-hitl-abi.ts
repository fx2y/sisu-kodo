import { execSync } from "node:child_process";

import { assertGateKey, assertGateReply } from "../src/contracts";
import {
  assertHitlGateKey,
  assertHitlTopic,
  LEGACY_HITL_TOPIC,
  normalizeHitlGateKey,
  toHumanTopic,
  toSystemTopic
} from "../src/lib/hitl-topic";
import {
  toHitlAuditKey,
  toHitlDecisionKey,
  toHitlPromptKey,
  toHitlResultKey
} from "../src/workflow/hitl/keys";

function mustThrow(label: string, fn: () => void): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(`policy-hitl-abi self-test failed: ${label} should fail`);
  }
}

function mustPass(label: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    throw new Error(`policy-hitl-abi self-test failed: ${label} should pass: ${String(error)}`);
  }
}

function runSelfTest(): void {
  mustPass("good gate key", () => assertGateKey("run1:decide:approve:a1"));
  mustThrow("bad gate key uppercase", () => assertGateKey("BadKey"));
  mustPass("good reply", () =>
    assertGateReply({ payload: { choice: "yes" }, dedupeKey: "d1", origin: "manual" })
  );
  mustThrow("bad reply missing dedupeKey", () => assertGateReply({ payload: { choice: "yes" } }));
}

function runAbiChecks(): void {
  const gateKey = normalizeHitlGateKey("Run 1:Decide:Approve:A1");
  assertHitlGateKey(gateKey);
  if (toHitlPromptKey(gateKey) !== `ui:${gateKey}`) {
    throw new Error("prompt key builder drift");
  }
  if (toHitlResultKey(gateKey) !== `ui:${gateKey}:result`) {
    throw new Error("result key builder drift");
  }
  if (toHitlDecisionKey(gateKey) !== `decision:${gateKey}`) {
    throw new Error("decision key builder drift");
  }
  if (toHitlAuditKey(gateKey) !== `ui:${gateKey}:audit`) {
    throw new Error("audit key builder drift");
  }

  const humanTopic = toHumanTopic(gateKey);
  const sysTopic = toSystemTopic("escalate-timeout");
  assertHitlTopic(humanTopic);
  assertHitlTopic(sysTopic);
  mustThrow("legacy non-ABI topic", () => assertHitlTopic("human-event"));
  if (LEGACY_HITL_TOPIC !== toHumanTopic("legacy-event")) {
    throw new Error("legacy HITL compatibility topic drift");
  }

  const humanEventRefs = execSync('rg -n "human-event" src app test || true', {
    encoding: "utf8"
  }).trim();
  if (humanEventRefs.length > 0) {
    throw new Error(`forbidden hardcoded topic literal found:\n${humanEventRefs}`);
  }
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("HITL ABI policy self-test: PASS");
    return;
  }
  if (arg) {
    throw new Error("usage: scripts/policy-hitl-abi.sh [--self-test]");
  }
  runSelfTest();
  runAbiChecks();
  console.log("HITL ABI policy: PASS");
}

main();
