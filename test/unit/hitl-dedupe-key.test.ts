import { describe, expect, it } from "vitest";
import { buildLegacyHitlDedupeKey } from "../../src/workflow/hitl/dedupe-key";

describe("buildLegacyHitlDedupeKey", () => {
  it("is deterministic for same tuple+payload", () => {
    const key1 = buildLegacyHitlDedupeKey({
      origin: "legacy-event",
      workflowId: "wf-1",
      runId: "run-1",
      gateKey: "approve-plan",
      topic: "human:approve-plan",
      payload: { approved: true, notes: "ok" }
    });
    const key2 = buildLegacyHitlDedupeKey({
      origin: "legacy-event",
      workflowId: "wf-1",
      runId: "run-1",
      gateKey: "approve-plan",
      topic: "human:approve-plan",
      payload: { notes: "ok", approved: true }
    });

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^legacy-event:[a-f0-9]{64}$/);
  });

  it("changes when payload changes", () => {
    const base = {
      origin: "legacy-approve" as const,
      workflowId: "wf-1",
      runId: "run-1",
      gateKey: "approve-plan",
      topic: "human:approve-plan"
    };
    const key1 = buildLegacyHitlDedupeKey({ ...base, payload: { approved: true } });
    const key2 = buildLegacyHitlDedupeKey({ ...base, payload: { approved: false } });
    expect(key1).not.toBe(key2);
  });
});
