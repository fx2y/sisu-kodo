import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ExternalEvent = {
  workflowId: string;
  gateKey: string;
  topic: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
  origin: string;
};

const schema: JSONSchemaType<ExternalEvent> = {
  $id: "ExternalEvent.v1",
  type: "object",
  additionalProperties: false,
  required: ["workflowId", "gateKey", "topic", "payload", "dedupeKey", "origin"],
  properties: {
    workflowId: { type: "string", minLength: 1 },
    gateKey: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^[a-z0-9][a-z0-9:_-]{0,127}$"
    },
    topic: {
      type: "string",
      minLength: 1,
      maxLength: 132,
      pattern: "^(human|sys):[a-z0-9][a-z0-9:_-]{0,127}$"
    },
    payload: { type: "object", additionalProperties: true, required: [] },
    dedupeKey: { type: "string", minLength: 1, maxLength: 256 },
    origin: {
      type: "string",
      enum: ["manual", "engine-dbos", "api-shim", "webhook", "webhook-ci", "external", "unknown"]
    }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ExternalEvent>;

export function assertExternalEvent(value: unknown): asserts value is ExternalEvent {
  assertValid(validate, value, "ExternalEvent");
}
