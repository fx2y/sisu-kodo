import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GateAudit = {
  schemaVersion: number;
  event: string;
  actor?: string | null;
  reason?: string | null;
  at: number;
};

const schema: JSONSchemaType<GateAudit> = {
  $id: "HitlGateAudit.v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "event", "at"],
  properties: {
    schemaVersion: { type: "integer", minimum: 1 },
    event: { type: "string" },
    actor: { type: "string", nullable: true },
    reason: { type: "string", nullable: true },
    at: { type: "integer", minimum: 0 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GateAudit>;

export function assertGateAudit(value: unknown): asserts value is GateAudit {
  assertValid(validate, value, "HitlGateAudit");
}
