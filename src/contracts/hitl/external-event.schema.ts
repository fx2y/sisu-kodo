import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ExternalEvent = {
  workflowId: string;
  gateKey: string;
  topic: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
  origin?: string;
};

const schema: JSONSchemaType<ExternalEvent> = {
  $id: "ExternalEvent.v1",
  type: "object",
  additionalProperties: false,
  required: ["workflowId", "gateKey", "topic", "payload", "dedupeKey"],
  properties: {
    workflowId: { type: "string", minLength: 1 },
    gateKey: { type: "string", minLength: 1 },
    topic: { type: "string", minLength: 1 },
    payload: { type: "object", additionalProperties: true, required: [] },
    dedupeKey: { type: "string", minLength: 1 },
    origin: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ExternalEvent>;

export function assertExternalEvent(value: unknown): asserts value is ExternalEvent {
  assertValid(validate, value, "ExternalEvent");
}
