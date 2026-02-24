import { describe, it, expect } from "vitest";
import { assertRunHeader } from "../../src/contracts/ui/run-header.schema";
import { assertStepRow } from "../../src/contracts/ui/step-row.schema";
import { assertArtifactRefV1 } from "../../src/contracts/ui/artifact-ref-v1.schema";

describe("FE Contracts", () => {
  it("should validate a valid RunHeader with posture fields", () => {
    const valid: unknown = {
      workflowID: "run-123",
      status: "WAITING_INPUT",
      workflowName: "TestWF",
      createdAt: Date.now(),
      nextAction: "APPROVE_PLAN",
      topology: "api-shim",
      runtimeMode: "api-shim",
      ocMode: "replay",
      sbxMode: "mock",
      sbxProvider: "e2b",
      appVersion: "v1.2.3",
      claimScope: "demo",
      durableStatus: "waiting_input"
    };
    expect(() => assertRunHeader(valid)).not.toThrow();
  });

  it("should fail RunHeader with invalid status", () => {
    const invalid: unknown = {
      workflowID: "run-123",
      status: "INVALID_STATUS"
    };
    expect(() => assertRunHeader(invalid)).toThrow();
  });

  it("should fail RunHeader with additional properties (fail-closed)", () => {
    const invalid: unknown = {
      workflowID: "run-123",
      status: "PENDING",
      extra: "not allowed"
    };
    expect(() => assertRunHeader(invalid)).toThrow();
  });

  it("should validate a valid StepRow", () => {
    const valid: unknown = {
      stepID: "step-1",
      name: "Step One",
      attempt: 1,
      startedAt: Date.now(),
      artifactRefs: [
        {
          id: "art-1",
          workflowID: "run-123",
          stepID: "step-1",
          kind: "json",
          mime: "application/json",
          size: 100
        }
      ]
    };
    expect(() => assertStepRow(valid)).not.toThrow();
  });

  it("should validate a valid ArtifactRefV1", () => {
    const valid: unknown = {
      id: "art-1",
      workflowID: "run-123",
      stepID: "step-1",
      kind: "svg",
      mime: "image/svg+xml",
      size: 500
    };
    expect(() => assertArtifactRefV1(valid)).not.toThrow();
  });
});
