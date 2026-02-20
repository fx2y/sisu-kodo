import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GetWorkflowStepsParams = {
  id: string;
};

const schema: JSONSchemaType<GetWorkflowStepsParams> = {
  $id: "GetWorkflowStepsParams.v0",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GetWorkflowStepsParams>;

export function assertGetWorkflowStepsParams(
  value: unknown
): asserts value is GetWorkflowStepsParams {
  assertValid(validate, value, "GetWorkflowStepsParams");
}
