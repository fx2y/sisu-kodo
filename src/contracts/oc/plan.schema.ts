import { ajv, assertValid } from "../index";
import type { ValidateFunction } from "ajv";
import { createHash } from "crypto";

export type PlanOutput = {
  goal: string;
  design: string[];
  files: string[];
  risks: string[];
  tests: string[];
  patchPlan?: {
    targetPath: string;
    postimageContent: string;
    diffText: string;
  }[];
};

export const PlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "design", "files", "risks", "tests"],
  properties: {
    goal: { type: "string" },
    design: { type: "array", items: { type: "string" }, maxItems: 25 },
    files: { type: "array", items: { type: "string" }, maxItems: 30 },
    risks: { type: "array", items: { type: "string" }, maxItems: 15 },
    tests: { type: "array", items: { type: "string" }, maxItems: 100 },
    patchPlan: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["targetPath", "postimageContent", "diffText"],
        properties: {
          targetPath: { type: "string", minLength: 1, maxLength: 1024 },
          postimageContent: { type: "string", maxLength: 200000 },
          diffText: { type: "string", maxLength: 200000 }
        }
      }
    }
  }
} as const;

export const planSchemaHash = createHash("sha256").update(JSON.stringify(PlanSchema)).digest("hex");

const validate = ajv.compile(PlanSchema) as ValidateFunction<PlanOutput>;

export function assertPlanOutput(value: unknown): asserts value is PlanOutput {
  assertValid(validate, value, "plan output");
}
