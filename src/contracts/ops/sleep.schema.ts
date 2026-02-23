import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { OpsActionResponse } from "./cancel.schema";

export type SleepWorkflowRequest = {
  workflowID: string;
  sleepMs: number;
};

const requestSchema: JSONSchemaType<SleepWorkflowRequest> = {
  $id: "SleepWorkflowRequest.v0",
  type: "object",
  additionalProperties: false,
  required: ["workflowID", "sleepMs"],
  properties: {
    workflowID: { type: "string", minLength: 1 },
    sleepMs: { type: "integer", minimum: 1 }
  }
};

const responseSchema: JSONSchemaType<OpsActionResponse> = {
  $id: "SleepWorkflowResponse.v0",
  type: "object",
  additionalProperties: false,
  required: ["accepted", "workflowID"],
  properties: {
    accepted: { type: "boolean" },
    workflowID: { type: "string", minLength: 1 }
  }
};

const validateRequest = ajv.compile(requestSchema) as ValidateFunction<SleepWorkflowRequest>;
const validateResponse = ajv.compile(responseSchema) as ValidateFunction<OpsActionResponse>;

export function assertSleepWorkflowRequest(value: unknown): asserts value is SleepWorkflowRequest {
  assertValid(validateRequest, value, "SleepWorkflowRequest");
}

export function assertSleepWorkflowResponse(value: unknown): asserts value is OpsActionResponse {
  assertValid(validateResponse, value, "SleepWorkflowResponse");
}
