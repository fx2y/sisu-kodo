import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GatePrompt = {
  schemaVersion: number;
  formSchema: Record<string, unknown>;
  ttlS: number;
  createdAt: number;
  deadlineAt: number;
  uiHints?: Record<string, unknown> | null;
  defaults?: Record<string, unknown> | null;
};

const schema: JSONSchemaType<GatePrompt> = {
  $id: "HitlGatePrompt.v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "formSchema", "ttlS", "createdAt", "deadlineAt"],
  properties: {
    schemaVersion: { type: "integer", minimum: 1 },
    formSchema: { type: "object", additionalProperties: true, required: [] },
    ttlS: { type: "integer", minimum: 1, maximum: 86400 },
    createdAt: { type: "integer", minimum: 0 },
    deadlineAt: { type: "integer", minimum: 0 },
    uiHints: { type: "object", additionalProperties: true, required: [], nullable: true },
    defaults: { type: "object", additionalProperties: true, required: [], nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GatePrompt>;

export function assertGatePrompt(value: unknown): asserts value is GatePrompt {
  assertValid(validate, value, "HitlGatePrompt");
}
