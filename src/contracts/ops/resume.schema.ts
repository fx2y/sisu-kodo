import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { OpsActionResponse } from "./cancel.schema";

export type ResumeWorkflowParams = {
  id: string;
};

export type ResumeWorkflowRequest = {
  actor: string;
  reason: string;
};

const schema: JSONSchemaType<ResumeWorkflowParams> = {
  $id: "ResumeWorkflowParams.v0",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
};

const requestSchema: JSONSchemaType<ResumeWorkflowRequest> = {
  $id: "ResumeWorkflowRequest.v0",
  type: "object",
  additionalProperties: false,
  required: ["actor", "reason"],
  properties: {
    actor: { type: "string", minLength: 1 },
    reason: { type: "string", minLength: 1 }
  }
};

const responseSchema: JSONSchemaType<OpsActionResponse> = {
  $id: "ResumeWorkflowResponse.v0",
  type: "object",
  additionalProperties: false,
  required: ["accepted", "workflowID"],
  properties: {
    accepted: { type: "boolean" },
    workflowID: { type: "string", minLength: 1 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ResumeWorkflowParams>;
const validateRequest = ajv.compile(requestSchema) as ValidateFunction<ResumeWorkflowRequest>;
const validateResponse = ajv.compile(responseSchema) as ValidateFunction<OpsActionResponse>;

export function assertResumeWorkflowParams(value: unknown): asserts value is ResumeWorkflowParams {
  assertValid(validate, value, "ResumeWorkflowParams");
}

export function assertResumeWorkflowRequest(
  value: unknown
): asserts value is ResumeWorkflowRequest {
  assertValid(validateRequest, value, "ResumeWorkflowRequest");
}

export function assertResumeWorkflowResponse(value: unknown): asserts value is OpsActionResponse {
  assertValid(validateResponse, value, "ResumeWorkflowResponse");
}
