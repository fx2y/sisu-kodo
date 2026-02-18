import { ajv, assertValid } from "../index";
import type { ValidateFunction } from "ajv";

export type OCPlanOutput = {
  design: string[];
  files: string[];
  risks: string[];
  tests: string[];
};

export const OCPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["design", "files", "risks", "tests"],
  properties: {
    design: { type: "array", items: { type: "string" }, maxItems: 25 },
    files: { type: "array", items: { type: "string" }, maxItems: 30 },
    risks: { type: "array", items: { type: "string" }, maxItems: 15 },
    tests: { type: "array", items: { type: "string" }, maxItems: 20 }
  }
} as const;

const validate = ajv.compile(OCPlanSchema) as ValidateFunction<OCPlanOutput>;

export function assertOCPlanOutput(value: unknown): asserts value is OCPlanOutput {
  assertValid(validate, value, "OC plan output");
}
