import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type CancelWorkflowParams = {
  id: string;
};

export type CancelWorkflowRequest = {
  actor: string;
  reason: string;
};

export type OpsActionResponse = {
  accepted: boolean;
  workflowID: string;
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

const requestSchema: JSONSchemaType<CancelWorkflowRequest> = {
  $id: "CancelWorkflowRequest.v0",
  type: "object",
  additionalProperties: false,
  required: ["actor", "reason"],
  properties: {
    actor: { type: "string", minLength: 1 },
    reason: { type: "string", minLength: 1 }
  }
};

const responseSchema: JSONSchemaType<OpsActionResponse> = {
  $id: "CancelWorkflowResponse.v0",
  type: "object",
  additionalProperties: false,
  required: ["accepted", "workflowID"],
  properties: {
    accepted: { type: "boolean" },
    workflowID: { type: "string", minLength: 1 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<CancelWorkflowParams>;
const validateRequest = ajv.compile(requestSchema) as ValidateFunction<CancelWorkflowRequest>;
const validateResponse = ajv.compile(responseSchema) as ValidateFunction<OpsActionResponse>;

export function assertCancelWorkflowParams(value: unknown): asserts value is CancelWorkflowParams {
  assertValid(validate, value, "CancelWorkflowParams");
}

export function assertCancelWorkflowRequest(
  value: unknown
): asserts value is CancelWorkflowRequest {
  assertValid(validateRequest, value, "CancelWorkflowRequest");
}

export function assertCancelWorkflowResponse(value: unknown): asserts value is OpsActionResponse {
  assertValid(validateResponse, value, "CancelWorkflowResponse");
}
