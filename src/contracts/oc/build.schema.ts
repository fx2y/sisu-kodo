import { ajv, assertValid } from "../index";
import type { ValidateFunction } from "ajv";
import { createHash } from "crypto";

export type BuildOutput = {
  patch: {
    path: string;
    diff: string;
  }[];
  tests: string[];
  test_command: string;
};

export const BuildSchema = {
  type: "object",
  additionalProperties: false,
  required: ["patch", "tests", "test_command"],
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
    tests: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 100 },
    test_command: { type: "string" }
  }
} as const;

export const buildSchemaHash = createHash("sha256")
  .update(JSON.stringify(BuildSchema))
  .digest("hex");

const validate = ajv.compile(BuildSchema) as ValidateFunction<BuildOutput>;

export function assertBuildOutput(value: unknown): asserts value is BuildOutput {
  assertValid(validate, value, "build output");
}
