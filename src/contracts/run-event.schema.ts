import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type RunEvent = {
  type: string;
  payload: Record<string, unknown>;
};

const schema: JSONSchemaType<RunEvent> = {
  $id: "RunEvent.v0",
  type: "object",
  additionalProperties: false,
  required: ["type", "payload"],
  properties: {
    type: { type: "string" },
    payload: { type: "object", additionalProperties: true, required: [] }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<RunEvent>;

export function assertRunEvent(value: unknown): asserts value is RunEvent {
  assertValid(validate, value, "RunEvent");
}
