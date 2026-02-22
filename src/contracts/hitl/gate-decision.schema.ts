import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GateDecision = {
  schemaVersion: number;
  decision: "yes" | "no";
  payload?: { rationale?: string | null } | null;
  at: number;
};

const schema: JSONSchemaType<GateDecision> = {
  $id: "HitlGateDecision.v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "decision", "at"],
  properties: {
    schemaVersion: { type: "integer", minimum: 1 },
    decision: { type: "string", enum: ["yes", "no"] },
    payload: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: [],
      properties: {
        rationale: { type: "string", nullable: true }
      }
    },
    at: { type: "integer", minimum: 0 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GateDecision>;

export function assertGateDecision(value: unknown): asserts value is GateDecision {
  assertValid(validate, value, "HitlGateDecision");
}
