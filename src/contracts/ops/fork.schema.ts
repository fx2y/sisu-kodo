import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ForkWorkflowParams = {
  id: string;
};

export type ForkWorkflowRequest = {
  stepN?: string;
  appVersion?: string;
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
  required: [],
  properties: {
    stepN: { type: "string", nullable: true },
    appVersion: { type: "string", nullable: true }
  }
};

const validateParams = ajv.compile(paramsSchema) as ValidateFunction<ForkWorkflowParams>;
const validateBody = ajv.compile(bodySchema) as ValidateFunction<ForkWorkflowRequest>;

export function assertForkWorkflowParams(value: unknown): asserts value is ForkWorkflowParams {
  assertValid(validateParams, value, "ForkWorkflowParams");
}

export function assertForkWorkflowRequest(value: unknown): asserts value is ForkWorkflowRequest {
  assertValid(validateBody, value, "ForkWorkflowRequest");
}
