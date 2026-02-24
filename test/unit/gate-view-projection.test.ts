import { describe, expect, test } from "vitest";
import { projectGateView } from "../../src/server/gate-view";

const prompt = {
  schemaVersion: 1,
  formSchema: { title: "Approve", fields: [] },
  ttlS: 60,
  createdAt: 1_700_000_000_000,
  deadlineAt: 1_700_000_060_000
} as const;

describe("projectGateView", () => {
  test("maps RECEIVED + decision to RESOLVED", () => {
    const view = projectGateView(
      "wf-1",
      { gateKey: "ui:g1", topic: "human:ui:g1", createdAt: prompt.createdAt },
      prompt,
      { schemaVersion: 1, state: "RECEIVED", payload: { choice: "yes" }, at: prompt.createdAt + 1 },
      { schemaVersion: 1, decision: "yes", at: prompt.createdAt + 1 },
      { origin: "manual", payloadHash: "a".repeat(64) }
    );
    expect(view.state).toBe("RESOLVED");
    expect(view.origin).toBe("manual");
  });

  test("keeps TIMED_OUT from result event", () => {
    const view = projectGateView(
      "wf-1",
      { gateKey: "ui:g1", topic: "human:ui:g1", createdAt: prompt.createdAt },
      prompt,
      { schemaVersion: 1, state: "TIMED_OUT", at: prompt.deadlineAt + 1 }
    );
    expect(view.state).toBe("TIMED_OUT");
  });
});
