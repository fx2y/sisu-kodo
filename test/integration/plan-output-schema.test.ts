import { describe, expect, test } from "vitest";
import { assertPlanOutput } from "../../src/contracts/oc/plan.schema";

describe("plan output schema", () => {
  test("accepts plan payload without patch fields", () => {
    expect(() =>
      assertPlanOutput({
        goal: "ship feature",
        design: ["do x"],
        files: ["src/a.ts"],
        risks: ["r1"],
        tests: ["test/a.test.ts"]
      })
    ).not.toThrow();
  });

  test("rejects plan payload containing patch fields", () => {
    expect(() =>
      assertPlanOutput({
        goal: "ship feature",
        design: ["do x"],
        files: ["src/a.ts"],
        risks: ["r1"],
        tests: ["test/a.test.ts"],
        patch: [{ path: "src/a.ts", diff: "x" }]
      })
    ).toThrow("invalid plan output");
  });
});
