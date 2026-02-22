import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildGateKey } from "../../src/workflow/hitl/gate-key";
import { toHitlDecisionKey, toHitlResultKey } from "../../src/workflow/hitl/keys";
import type { GateResult } from "../../src/contracts/hitl/gate-result.schema";
import type { GateDecision } from "../../src/contracts/hitl/gate-decision.schema";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { HITLChaosKit } from "../helpers/hitl-chaos-kit";

let lc: TestLifecycle;
let kit: HITLChaosKit;
let successArtifactCount = -1;

beforeAll(async () => {
  lc = await setupLifecycle(20);
  kit = new HITLChaosKit(lc);
});

afterAll(async () => {
  await teardownLifecycle(lc);
});

describe("HITL C6 golden scenarios", () => {
  test("approve yes: succeeds with one prompt and one interaction", async () => {
    const { runId, intentId } = await kit.spawnRun("c6 golden approve yes");
    const gate = await kit.waitForGate(runId);

    await kit.getEventOrThrow(intentId, `ui:${gate.gate_key}`);
    await kit.sendReply(intentId, gate.gate_key, { choice: "yes", rationale: "ship" }, "g-yes-1");
    await kit.waitForRunStatus(runId, "succeeded");

    await kit.assertNoPhantomPrompt(intentId, gate.gate_key);
    expect(
      await kit.countInteractionRows(intentId, { gateKey: gate.gate_key, dedupeKey: "g-yes-1" })
    ).toBe(1);
    const result = await kit.getEventOrThrow<GateResult>(intentId, toHitlResultKey(gate.gate_key));
    expect(result).toMatchObject({ state: "RECEIVED" });

    successArtifactCount = await kit.countArtifacts(runId);
    expect(successArtifactCount).toBeGreaterThan(0);
  }, 45_000);

  test("approve no: terminal retries_exceeded and deterministic decision", async () => {
    const { runId, intentId } = await kit.spawnRun("c6 golden approve no");
    const gate = await kit.waitForGate(runId);

    await kit.getEventOrThrow(intentId, `ui:${gate.gate_key}`);
    await kit.sendReply(intentId, gate.gate_key, { choice: "no", rationale: "reject" }, "g-no-1");
    await kit.waitForRunStatus(runId, "retries_exceeded");

    await kit.assertNoPhantomPrompt(intentId, gate.gate_key);
    const decision = await kit.getEventOrThrow<GateDecision>(
      intentId,
      toHitlDecisionKey(gate.gate_key)
    );
    expect(decision).toMatchObject({ decision: "no", payload: { rationale: "reject" } });
  }, 45_000);

  test("reply dedupe: duplicate dedupeKey creates one visible effect", async () => {
    const { runId, intentId } = await kit.spawnRun("c6 golden dedupe");
    const gate = await kit.waitForGate(runId);
    await kit.getEventOrThrow(intentId, `ui:${gate.gate_key}`);

    await Promise.all(
      Array.from({ length: 5 }, () =>
        kit.sendReply(intentId, gate.gate_key, { choice: "yes" }, "g-dedupe-1")
      )
    );
    await kit.waitForRunStatus(runId, "succeeded");

    await kit.assertNoPhantomPrompt(intentId, gate.gate_key);
    expect(
      await kit.countInteractionRows(intentId, { gateKey: gate.gate_key, dedupeKey: "g-dedupe-1" })
    ).toBe(1);
    expect(await kit.countArtifacts(runId)).toBe(successArtifactCount);
  }, 45_000);

  test("timeout: emits TIMED_OUT result and one escalation row", async () => {
    process.env.HITL_PLAN_APPROVAL_TIMEOUT_S = "2";
    try {
      const { runId, intentId } = await kit.spawnRun("c6 golden timeout");
      const gate = await kit.waitForGate(runId);

      await kit.getEventOrThrow(intentId, `ui:${gate.gate_key}`);
      await kit.waitForRunStatus(runId, "retries_exceeded");
      await kit.waitForEscalationSuccess(intentId, gate.gate_key, { timeoutMs: 15_000 });

      const result = await kit.getEventOrThrow<GateResult>(
        intentId,
        toHitlResultKey(gate.gate_key),
        1
      );
      expect(result).toMatchObject({ state: "TIMED_OUT" });
      expect(await kit.countEscalationRows(intentId, gate.gate_key)).toBe(1);
      expect(await kit.countArtifacts(runId)).toBeGreaterThan(0);
    } finally {
      delete process.env.HITL_PLAN_APPROVAL_TIMEOUT_S;
    }
  }, 45_000);

  test("late reply after timeout: gate remains timed out", async () => {
    process.env.HITL_PLAN_APPROVAL_TIMEOUT_S = "2";
    try {
      const { runId, intentId } = await kit.spawnRun("c6 golden late timeout");
      const gate = await kit.waitForGate(runId);
      await kit.getEventOrThrow(intentId, `ui:${gate.gate_key}`);
      await kit.waitForRunStatus(runId, "retries_exceeded");
      const artifactCountBeforeLateReply = await kit.countArtifacts(runId);

      const before = await kit.countInteractionRows(intentId, {
        gateKey: gate.gate_key,
        dedupeKey: "g-late-1"
      });
      await kit.sendReply(
        intentId,
        gate.gate_key,
        { choice: "yes", rationale: "late" },
        "g-late-1"
      );
      const after = await kit.countInteractionRows(intentId, {
        gateKey: gate.gate_key,
        dedupeKey: "g-late-1"
      });
      expect(after - before).toBe(1);

      const run = await kit.getRun(runId);
      expect(run.status).toBe("retries_exceeded");
      const result = await kit.getEventOrThrow<GateResult>(
        intentId,
        toHitlResultKey(gate.gate_key),
        1
      );
      expect(result).toMatchObject({ state: "TIMED_OUT" });
      expect(await kit.countArtifacts(runId)).toBe(artifactCountBeforeLateReply);
    } finally {
      delete process.env.HITL_PLAN_APPROVAL_TIMEOUT_S;
    }
  }, 45_000);

  test("parallel gates: independent gating and one-prompt-per-gate", async () => {
    const { runId, intentId } = await kit.spawnRun("c6 golden parallel test");

    const g1 = buildGateKey(runId, "ApplyPatchST", "parallel-1", 1);
    const g2 = buildGateKey(runId, "ApplyPatchST", "parallel-2", 1);
    await kit.waitForGateKey(runId, g1);
    await kit.waitForGateKey(runId, g2);
    await kit.getEventOrThrow(intentId, `ui:${g1}`);
    await kit.getEventOrThrow(intentId, `ui:${g2}`);

    await kit.sendReply(intentId, g2, { choice: "yes" }, "g-par-2");
    const g1Result = await lc.workflow.getEvent(intentId, toHitlResultKey(g1), 0.2);
    expect(g1Result).toBeNull();

    await kit.sendReply(intentId, g1, { choice: "yes" }, "g-par-1");
    await kit.waitForRunStatus(runId, "succeeded");
    await kit.assertNoPhantomPrompt(intentId, g1);
    await kit.assertNoPhantomPrompt(intentId, g2);
    expect(await kit.countInteractionRows(intentId)).toBe(2);
  }, 45_000);
});
