import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GateReply = {
  payload: Record<string, unknown>;
  dedupeKey: string;
};

const schema: JSONSchemaType<GateReply> = {
  $id: "HitlGateReply.v1",
  type: "object",
  additionalProperties: false,
  required: ["payload", "dedupeKey"],
  properties: {
    payload: { type: "object", additionalProperties: true, required: [] },
    dedupeKey: { type: "string", minLength: 1, maxLength: 256 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GateReply>;

export function assertGateReply(value: unknown): asserts value is GateReply {
  assertValid(validate, value, "HitlGateReply");
}
