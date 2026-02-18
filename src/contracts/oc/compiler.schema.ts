import { ajv, assertValid } from "../index";
import type { ValidateFunction } from "ajv";
import { createHash } from "crypto";

export type CompileOutput = {
  goal: string;
  plan: string[];
  patch: {
    path: string;
    diff: string;
  }[];
  tests: string[];
  notes?: string;
};

export const CompilerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "plan", "patch", "tests"],
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
    notes: { type: "string" }
  }
} as const;

export const compilerSchemaHash = createHash("sha256")
  .update(JSON.stringify(CompilerSchema))
  .digest("hex");

const validate = ajv.compile(CompilerSchema) as ValidateFunction<CompileOutput>;

export function assertCompileOutput(value: unknown): asserts value is CompileOutput {
  assertValid(validate, value, "compiler output");
}
