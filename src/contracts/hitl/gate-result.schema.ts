import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GateResultState = "RECEIVED" | "TIMED_OUT";

export type GateResult = {
  schemaVersion: number;
  state: GateResultState;
  payload?: Record<string, unknown> | null;
  payloadHash?: string | null;
  at?: number | null;
};

const schema: JSONSchemaType<GateResult> = {
  $id: "HitlGateResult.v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "state"],
  properties: {
    schemaVersion: { type: "integer", minimum: 1 },
    state: {
      type: "string",
      enum: ["RECEIVED", "TIMED_OUT"]
    },
    payload: { type: "object", additionalProperties: true, required: [], nullable: true },
    payloadHash: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
    at: { type: "integer", minimum: 0, nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GateResult>;

export function assertGateResult(value: unknown): asserts value is GateResult {
  assertValid(validate, value, "HitlGateResult");
}
