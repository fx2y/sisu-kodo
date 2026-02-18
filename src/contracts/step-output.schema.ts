import { ajv, assertValid } from "./index";
import type { ValidateFunction } from "ajv";
import { assertOCOutput } from "./oc/output.schema";

export const CompileOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "inputs", "constraints", "timestamp"],
  properties: {
    goal: { type: "string" },
    inputs: { type: "object", additionalProperties: true },
    constraints: { type: "object", additionalProperties: true },
    timestamp: { type: "string" }
  }
} as const;

export const PatchedOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "inputs", "constraints", "timestamp"],
  properties: {
    goal: { type: "string" },
    inputs: { type: "object", additionalProperties: true },
    constraints: { type: "object", additionalProperties: true },
    timestamp: { type: "string" },
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

const compileValidate = ajv.compile(CompileOutputSchema);
const patchedValidate = ajv.compile(PatchedOutputSchema);
const sandboxValidate = ajv.compile(SandboxResultSchema);

export function assertStepOutput(stepId: string, value: unknown): void {
  if (stepId === "CompileST") {
    assertValid(compileValidate as ValidateFunction, value, "CompileST output");
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
