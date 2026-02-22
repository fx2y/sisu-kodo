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
});
