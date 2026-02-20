import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GateDecision = {
  schemaVersion: number;
  decision: string;
  payload?: Record<string, unknown> | null;
  at: number;
};

const schema: JSONSchemaType<GateDecision> = {
  $id: "HitlGateDecision.v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "decision", "at"],
  properties: {
    schemaVersion: { type: "integer", minimum: 1 },
    decision: { type: "string", minLength: 1 },
    payload: { type: "object", additionalProperties: true, required: [], nullable: true },
    at: { type: "integer", minimum: 0 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GateDecision>;

export function assertGateDecision(value: unknown): asserts value is GateDecision {
  assertValid(validate, value, "HitlGateDecision");
}
