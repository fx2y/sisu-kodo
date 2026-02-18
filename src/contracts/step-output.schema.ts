import { ajv, assertValid } from "./index";
import type { ValidateFunction } from "ajv";
import { assertOCOutput } from "./oc/output.schema";
import { assertCompileOutput } from "./oc/compiler.schema";

export const PatchedOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "plan", "patch", "tests", "patchedAt"],
  properties: {
    goal: { type: "string" },
    plan: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 30 },
    patch: {
      type: "array",
      minItems: 0,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "diff"],
        properties: {
          path: { type: "string" },
          diff: { type: "string", maxLength: 20000 }
        }
      }
    },
    tests: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 20 },
    notes: { type: "string" },
    patchedAt: { type: "string" }
  }
} as const;

export const SandboxResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["exitCode", "stdout", "files"],
  properties: {
    exitCode: { type: "number" },
    stdout: { type: "string" },
    files: { type: "object", additionalProperties: { type: "string" } }
  }
} as const;

const patchedValidate = ajv.compile(PatchedOutputSchema);
const sandboxValidate = ajv.compile(SandboxResultSchema);

export function assertStepOutput(stepId: string, value: unknown): void {
  if (stepId === "CompileST") {
    assertCompileOutput(value);
  } else if (stepId === "ApplyPatchST") {
    assertValid(patchedValidate as ValidateFunction, value, "ApplyPatchST output");
  } else if (stepId === "DecideST") {
    assertOCOutput(value);
  } else if (stepId === "ExecuteST") {
    assertValid(sandboxValidate as ValidateFunction, value, "ExecuteST output");
  } else {
    // Fallback for unexpected step IDs during transition
    if (typeof value !== "object" || value === null) {
      throw new Error(`Step ${stepId} output must be an object`);
    }
  }
}
