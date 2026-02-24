import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ClaimScopeValue = "signoff" | "demo" | "live-smoke" | "batch" | "interactive";

export type ClaimScope = {
  scope: ClaimScopeValue;
  label: string;
  description?: string;
  color?: string;
};

const schema: JSONSchemaType<ClaimScope> = {
  $id: "ClaimScope.v1",
  type: "object",
  additionalProperties: false,
  required: ["scope", "label"],
  properties: {
    scope: {
      type: "string",
      enum: ["signoff", "demo", "live-smoke", "batch", "interactive"]
    },
    label: { type: "string" },
    description: { type: "string", nullable: true },
    color: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ClaimScope>;

export function assertClaimScope(value: unknown): asserts value is ClaimScope {
  assertValid(validate, value, "ClaimScope");
}
