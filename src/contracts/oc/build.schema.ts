import { ajv, assertValid } from "../index";
import type { ValidateFunction } from "ajv";

export type OCBuildOutput = {
  patch: {
    path: string;
    diff: string;
  }[];
  tests: string[];
};

export const OCBuildSchema = {
  type: "object",
  additionalProperties: false,
  required: ["patch", "tests"],
  properties: {
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
    tests: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 20 }
  }
} as const;

const validate = ajv.compile(OCBuildSchema) as ValidateFunction<OCBuildOutput>;

export function assertOCBuildOutput(value: unknown): asserts value is OCBuildOutput {
  assertValid(validate, value, "OC build output");
}
