import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type CancelWorkflowParams = {
  id: string;
};

const schema: JSONSchemaType<CancelWorkflowParams> = {
  $id: "CancelWorkflowParams.v0",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<CancelWorkflowParams>;

export function assertCancelWorkflowParams(value: unknown): asserts value is CancelWorkflowParams {
  assertValid(validate, value, "CancelWorkflowParams");
}
