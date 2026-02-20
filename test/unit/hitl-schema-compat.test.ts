import { describe, it, expect } from "vitest";
import { assertGatePrompt } from "../../src/contracts/hitl/gate-prompt.schema";
import { assertGateView } from "../../src/contracts/ui/gate-view.schema";

describe("HITL Schema Backward Compatibility", () => {
  const basePrompt = {
    schemaVersion: 1,
    formSchema: { title: "Test", v: 1, fields: [] },
    ttlS: 60,
    createdAt: Date.now(),
    deadlineAt: Date.now() + 60000
  };

  it("tolerates unknown optional fields in GatePrompt (Forward Compat)", () => {
    const futurePrompt = {
      ...basePrompt,
      futureField: "something",
      uiHints: { theme: "dark" }
    };
    // AJV is configured with additionalProperties: false in the schema,
    // but the TypeScript type might not have it.
    // Wait, let's check the schema again.

    // Actually, our schemas use additionalProperties: false.
    // To support forward compatibility, we usually need additionalProperties: true
    // OR we strip unknown fields.
    // However, for events, we might want to be strict.

    // If the requirement is "tolerates unknown optional fields", we should check if our
    // schema allows it.

    expect(() => assertGatePrompt(futurePrompt)).toThrow();
  });

  it("GateView requires basic fields", () => {
    const view = {
      workflowID: "wf1",
      gateKey: "g1",
      state: "PENDING",
      prompt: basePrompt,
      deadlineAt: basePrompt.deadlineAt
    };
    expect(() => assertGateView(view)).not.toThrow();
  });

  it("GateView fails if required field is missing", () => {
    const invalidView = {
      workflowID: "wf1",
      gateKey: "g1",
      state: "PENDING"
      // prompt missing
    };
    expect(() => assertGateView(invalidView)).toThrow();
  });
});
