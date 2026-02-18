import { ajv, assertValid } from "../index";
import type { ValidateFunction } from "ajv";

export type OCCompileOutput = {
  plan: string[];
  patch: {
    path: string;
    diff: string;
  }[];
  tests: string[];
  notes?: string;
};

export const OCCompileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["plan", "patch", "tests"],
  properties: {
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

const validate = ajv.compile(OCCompileSchema) as ValidateFunction<OCCompileOutput>;

export function assertOCCompileOutput(value: unknown): asserts value is OCCompileOutput {
  assertValid(validate, value, "OC compile output");
}
