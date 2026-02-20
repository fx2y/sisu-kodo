import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import { opsWorkflowSummarySchema } from "./list.schema";
import type { OpsWorkflowSummary } from "./list.schema";

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

const responseSchema: JSONSchemaType<OpsWorkflowSummary> = {
  ...opsWorkflowSummarySchema,
  $id: "GetWorkflowResponse.v0"
};

const validate = ajv.compile(schema) as ValidateFunction<WorkflowIdParam>;
const validateResponse = ajv.compile(responseSchema) as ValidateFunction<OpsWorkflowSummary>;

export function assertWorkflowIdParam(value: unknown): asserts value is WorkflowIdParam {
  assertValid(validate, value, "WorkflowIdParam");
}

export function assertGetWorkflowResponse(value: unknown): asserts value is OpsWorkflowSummary {
  assertValid(validateResponse, value, "GetWorkflowResponse");
}
