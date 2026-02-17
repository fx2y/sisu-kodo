import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type RunRequest = {
  traceId?: string;
  queueName?: string;
  priority?: number;
  deduplicationID?: string;
  timeoutMS?: number;
};

const schema: JSONSchemaType<RunRequest> = {
  $id: "RunRequest.v0",
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    traceId: { type: "string", nullable: true },
    queueName: { type: "string", nullable: true },
    priority: { type: "integer", nullable: true },
    deduplicationID: { type: "string", nullable: true },
    timeoutMS: { type: "integer", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<RunRequest>;

export function assertRunRequest(value: unknown): asserts value is RunRequest {
  assertValid(validate, value, "RunRequest");
}
