import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { OCOutput } from "../oc/schema";
import type { SandboxResult } from "../sbx/runner";
import type { CompiledIntent } from "../workflow/steps/compile.step";
import type { PatchedIntent } from "../workflow/steps/apply-patch.step";

export type StepOutput = CompiledIntent | PatchedIntent | OCOutput | SandboxResult;

// A general object schema that allows any object
const schema: JSONSchemaType<StepOutput> = {
  $id: "StepOutput.v0",
  type: "object",
  additionalProperties: true,
  required: []
} as unknown as JSONSchemaType<StepOutput>;

const validate = ajv.compile(schema) as ValidateFunction<StepOutput>;

export function assertStepOutput(value: unknown): asserts value is StepOutput {
  assertValid(validate, value, "Step output");
}
