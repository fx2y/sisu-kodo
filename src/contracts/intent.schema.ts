import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type Intent = {
  goal: string;
  inputs: Record<string, unknown>;
  constraints: Record<string, unknown>;
  connectors?: string[];
};

const schema: JSONSchemaType<Intent> = {
  $id: "Intent.v0",
  type: "object",
  additionalProperties: false,
  required: ["goal", "inputs", "constraints"],
  properties: {
    goal: { type: "string", minLength: 1 },
    inputs: { type: "object", additionalProperties: true, required: [] },
    constraints: { type: "object", additionalProperties: true, required: [] },
    connectors: {
      type: "array",
      items: { type: "string" },
      nullable: true
    }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<Intent>;

export function assertIntent(value: unknown): asserts value is Intent {
  assertValid(validate, value, "Intent");
}
