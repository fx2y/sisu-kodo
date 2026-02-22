import { ajv, assertValid } from "./index";
import type { ValidateFunction } from "ajv";
import { assertOCOutput } from "./oc/output.schema";
import { assertPlanOutput } from "./oc/plan.schema";
import { assertSBXRes } from "./sbx/sbx-res.schema";

export const PatchedOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "design", "files", "risks", "tests"],
  properties: {
    goal: { type: "string" },
    design: { type: "array", items: { type: "string" }, maxItems: 25 },
    files: { type: "array", items: { type: "string" }, maxItems: 30 },
    risks: { type: "array", items: { type: "string" }, maxItems: 15 },
    tests: { type: "array", items: { type: "string" }, maxItems: 20 }
  }
} as const;

const patchedValidate = ajv.compile(PatchedOutputSchema);

export function assertStepOutput(stepId: string, value: unknown): unknown {
  // Strip system fields before validation if it's an object
  let val = value;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const { attempt: _attempt, ...rest } = value as Record<string, unknown>;
    val = rest;
  }

  if (stepId === "CompileST") {
    assertPlanOutput(val);
  } else if (stepId === "ApplyPatchST") {
    assertValid(patchedValidate as ValidateFunction, val, "ApplyPatchST output");
  } else if (stepId === "DecideST") {
    assertOCOutput(val);
  } else if (stepId === "ExecuteST") {
    assertSBXRes(val);
  } else {
    throw new Error(`Unknown step output validator for ${stepId}`);
  }
  return val;
}
