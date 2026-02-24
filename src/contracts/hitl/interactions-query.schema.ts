import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type HitlInteractionsQuery = {
  limit?: number;
};

const schema: JSONSchemaType<HitlInteractionsQuery> = {
  $id: "HitlInteractionsQuery.v1",
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 500, nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<HitlInteractionsQuery>;

export function assertHitlInteractionsQuery(value: unknown): asserts value is HitlInteractionsQuery {
  assertValid(validate, value, "HitlInteractionsQuery");
}
