import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GateReply = {
  payload: Record<string, unknown>;
  dedupeKey: string;
  origin: "manual" | "api-shim" | "webhook" | "webhook-ci" | "external" | "unknown";
};

const schema: JSONSchemaType<GateReply> = {
  $id: "HitlGateReply.v1",
  type: "object",
  additionalProperties: false,
  required: ["payload", "dedupeKey", "origin"],
  properties: {
    payload: { type: "object", additionalProperties: true, required: [] },
    dedupeKey: { type: "string", minLength: 1, maxLength: 256 },
    origin: {
      type: "string",
      enum: ["manual", "api-shim", "webhook", "webhook-ci", "external", "unknown"]
    }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GateReply>;

export function assertGateReply(value: unknown): asserts value is GateReply {
  assertValid(validate, value, "HitlGateReply");
}
