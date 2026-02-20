import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type WorkflowIdParam = {
  id: string;
};

const schema: JSONSchemaType<WorkflowIdParam> = {
  $id: "WorkflowIdParam.v0",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<WorkflowIdParam>;

export function assertWorkflowIdParam(value: unknown): asserts value is WorkflowIdParam {
  assertValid(validate, value, "WorkflowIdParam");
}
