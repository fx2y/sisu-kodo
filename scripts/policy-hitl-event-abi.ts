import {
  assertGateAudit,
  assertGateDecision,
  assertGatePrompt,
  assertGateResult
} from "../src/contracts";
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
    throw new Error(`policy-hitl-event-abi self-test failed: ${label} should fail`);
  }
}

function mustPass(label: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    throw new Error(
      `policy-hitl-event-abi self-test failed: ${label} should pass: ${String(error)}`
    );
  }
}

function runSelfTest(): void {
  const prompt = {
    schemaVersion: 1,
    formSchema: { title: "Approve", fields: [{ k: "choice", t: "enum", vs: ["yes", "no"] }] },
    ttlS: 60,
    createdAt: 1_700_000_000_000,
    deadlineAt: 1_700_000_060_000
  };
  const result = {
    schemaVersion: 1,
    state: "RECEIVED" as const,
    payload: { choice: "yes" },
    at: 1_700_000_010_000
  };
  const decision = {
    schemaVersion: 1,
    decision: "yes" as const,
    payload: { rationale: "ok" },
    at: 1_700_000_010_000
  };
  const audit = {
    schemaVersion: 1,
    event: "RECEIVED" as const,
    actor: "qa",
    reason: "approved",
    at: 1_700_000_010_000
  };

  mustPass("good GatePrompt", () => assertGatePrompt(prompt));
  mustPass("good GateResult", () => assertGateResult(result));
  mustPass("good GateDecision", () => assertGateDecision(decision));
  mustPass("good GateAudit", () => assertGateAudit(audit));

  mustThrow("bad GatePrompt missing ttlS", () =>
    assertGatePrompt({ ...prompt, ttlS: undefined } as unknown)
  );
  mustThrow("bad GateResult wrong state", () =>
    assertGateResult({ ...result, state: "UNKNOWN" } as unknown)
  );
  mustThrow("bad GateDecision wrong decision", () =>
    assertGateDecision({ ...decision, decision: "maybe" } as unknown)
  );
  mustThrow("bad GateAudit wrong event", () =>
    assertGateAudit({ ...audit, event: "PENDING" } as unknown)
  );
}

function runRepoChecks(): void {
  const gateKey = "run1:decide:approve:a1";
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
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("HITL event ABI policy self-test: PASS");
    return;
  }
  if (arg) {
    throw new Error("usage: scripts/policy-hitl-event-abi.sh [--self-test]");
  }
  runSelfTest();
  runRepoChecks();
  console.log("HITL event ABI policy: PASS");
}

main();
