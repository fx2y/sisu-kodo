import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type RunRequest = {
  traceId?: string;
};

const schema: JSONSchemaType<RunRequest> = {
  $id: "RunRequest.v0",
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    traceId: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<RunRequest>;

export function assertRunRequest(value: unknown): asserts value is RunRequest {
  assertValid(validate, value, "RunRequest");
}
