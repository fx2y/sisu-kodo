import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ForkWorkflowParams = {
  id: string;
};

export type ForkWorkflowRequest = {
  stepN: number;
  appVersion?: string;
  actor: string;
  reason: string;
};

export type ForkWorkflowResponse = {
  accepted: boolean;
  workflowID: string;
  forkedWorkflowID: string;
};

const paramsSchema: JSONSchemaType<ForkWorkflowParams> = {
  $id: "ForkWorkflowParams.v0",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
};

const bodySchema: JSONSchemaType<ForkWorkflowRequest> = {
  $id: "ForkWorkflowRequest.v0",
  type: "object",
  additionalProperties: false,
  required: ["stepN", "actor", "reason"],
  properties: {
    stepN: { type: "integer", minimum: 1 },
    appVersion: { type: "string", nullable: true },
    actor: { type: "string", minLength: 1 },
    reason: { type: "string", minLength: 1 }
  }
};

const responseSchema: JSONSchemaType<ForkWorkflowResponse> = {
  $id: "ForkWorkflowResponse.v0",
  type: "object",
  additionalProperties: false,
  required: ["accepted", "workflowID", "forkedWorkflowID"],
  properties: {
    accepted: { type: "boolean" },
    workflowID: { type: "string", minLength: 1 },
    forkedWorkflowID: { type: "string", minLength: 1 }
  }
};

const validateParams = ajv.compile(paramsSchema) as ValidateFunction<ForkWorkflowParams>;
const validateBody = ajv.compile(bodySchema) as ValidateFunction<ForkWorkflowRequest>;
const validateResponse = ajv.compile(responseSchema) as ValidateFunction<ForkWorkflowResponse>;

export function assertForkWorkflowParams(value: unknown): asserts value is ForkWorkflowParams {
  assertValid(validateParams, value, "ForkWorkflowParams");
}

export function assertForkWorkflowRequest(value: unknown): asserts value is ForkWorkflowRequest {
  assertValid(validateBody, value, "ForkWorkflowRequest");
}

export function assertForkWorkflowResponse(value: unknown): asserts value is ForkWorkflowResponse {
  assertValid(validateResponse, value, "ForkWorkflowResponse");
}
