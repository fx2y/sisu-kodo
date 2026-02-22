import { describe, expect, test } from "vitest";
import { assertRunStartRequest } from "../../src/contracts/run-start.schema";

describe("RunStartRequest schema", () => {
  test("accepts lane metadata inside opts", () => {
    const req = {
      recipeRef: { id: "recipe-a", v: "1.0.0" },
      formData: {},
      opts: {
        lane: "interactive"
      }
    };
    expect(() => assertRunStartRequest(req)).not.toThrow();
  });

  test("rejects unknown lane metadata inside opts", () => {
    const req = {
      recipeRef: { id: "recipe-a", v: "1.0.0" },
      formData: {},
      opts: {
        lane: "urgent"
      }
    };
    expect(() => assertRunStartRequest(req)).toThrow();
  });

  test("rejects unknown budget fields inside opts", () => {
    const req = {
      recipeRef: { id: "recipe-a", v: "1.0.0" },
      formData: {},
      opts: {
        budget: {
          maxFanout: 1,
          maxSBXMinutes: 1,
          maxArtifactsMB: 1,
          maxRetriesPerStep: 0,
          maxWallClockMS: 1000,
          nope: 1
        }
      }
    };
    expect(() => assertRunStartRequest(req)).toThrow();
  });
});
