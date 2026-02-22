import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { startApp, type AppHandle } from "../../src/server/app";
import { toHitlResultKey } from "../../src/workflow/hitl/keys";
import type { GateResult } from "../../src/contracts/hitl/gate-result.schema";
import { HITLChaosKit } from "../helpers/hitl-chaos-kit";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";

let lc: TestLifecycle;
let kit: HITLChaosKit;
let app: AppHandle;

function replyUrl(workflowId: string, gateKey: string): string {
  const port = process.env.PORT ?? "3003";
  return `http://127.0.0.1:${port}/api/runs/${workflowId}/gates/${gateKey}/reply`;
}

beforeAll(async () => {
  lc = await setupLifecycle(20);
  kit = new HITLChaosKit(lc);
  app = await startApp(lc.pool, lc.workflow);
});

afterAll(async () => {
  await new Promise<void>((resolve) => app.server.close(() => resolve()));
  await teardownLifecycle(lc);
});

describe("HITL correctness policy probes", () => {
  test("malformed reply payload is 400 + zero interaction writes", async () => {
    const { runId, intentId } = await kit.spawnRun("policy malformed reply");
    const gate = await kit.waitForGate(runId);
    await kit.waitForEvent(intentId, `ui:${gate.gate_key}`);

    const beforeCount = await kit.countInteractionRows(intentId, { gateKey: gate.gate_key });
    const badRes = await fetch(replyUrl(intentId, gate.gate_key), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { choice: "yes" } })
    });
    expect(badRes.status).toBe(400);
    expect(await kit.countInteractionRows(intentId, { gateKey: gate.gate_key })).toBe(beforeCount);

    await fetch(replyUrl(intentId, gate.gate_key), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: { choice: "yes" },
        dedupeKey: "policy-malformed-cleanup",
        origin: "manual"
      })
    });
    await kit.waitForRunStatus(runId, "succeeded");
  }, 45_000);

  test("duplicate dedupe key keeps one interaction row", async () => {
    const { runId, intentId } = await kit.spawnRun("policy dedupe");
    const gate = await kit.waitForGate(runId);
    await kit.waitForEvent(intentId, `ui:${gate.gate_key}`);

    const payload = { payload: { choice: "yes" }, dedupeKey: "policy-dedupe-1", origin: "manual" };
    const [res1, res2] = await Promise.all([
      fetch(replyUrl(intentId, gate.gate_key), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }),
      fetch(replyUrl(intentId, gate.gate_key), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      })
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    await kit.waitForRunStatus(runId, "succeeded");
    expect(
      await kit.countInteractionRows(intentId, {
        gateKey: gate.gate_key,
        dedupeKey: payload.dedupeKey
      })
    ).toBe(1);
  }, 45_000);

  test("reply rejects non-waiting run with 409 + zero writes", async () => {
    const { runId, intentId } = await kit.spawnRun("policy late reply");
    const gate = await kit.waitForGate(runId);
    await kit.waitForEvent(intentId, `ui:${gate.gate_key}`);

    await fetch(replyUrl(intentId, gate.gate_key), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: { choice: "yes" },
        dedupeKey: `late-reply-initial-${intentId}`,
        origin: "manual"
      })
    });
    await kit.waitForRunStatus(runId, "succeeded");

    const before = await kit.countInteractionRows(intentId, { gateKey: gate.gate_key });
    const res = await fetch(replyUrl(intentId, gate.gate_key), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: { choice: "yes" },
        dedupeKey: `late-reply-after-success-${intentId}`,
        origin: "manual"
      })
    });
    expect(res.status).toBe(409);
    expect(await kit.countInteractionRows(intentId, { gateKey: gate.gate_key })).toBe(before);
  }, 45_000);

  test("timeout emits TIMED_OUT result and one escalation success row", async () => {
    process.env.HITL_PLAN_APPROVAL_TIMEOUT_S = "2";
    try {
      const { runId, intentId } = await kit.spawnRun("policy timeout escalation");
      const gate = await kit.waitForGate(runId);
      await kit.waitForEvent(intentId, `ui:${gate.gate_key}`);
      await kit.waitForRunStatus(runId, "retries_exceeded");
      await kit.waitForEscalationSuccess(intentId, gate.gate_key, { timeoutMs: 20_000 });

      const result = await kit.getEventOrThrow<GateResult>(
        intentId,
        toHitlResultKey(gate.gate_key),
        1
      );
      expect(result).toMatchObject({ state: "TIMED_OUT" });
      expect(await kit.countEscalationRows(intentId, gate.gate_key)).toBe(1);
    } finally {
      delete process.env.HITL_PLAN_APPROVAL_TIMEOUT_S;
    }
  }, 60_000);
});
