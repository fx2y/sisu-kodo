import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type HitlInboxQuery = {
  limit?: number;
};

const schema: JSONSchemaType<HitlInboxQuery> = {
  $id: "HitlInboxQuery.v1",
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 200, nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<HitlInboxQuery>;

export function assertHitlInboxQuery(value: unknown): asserts value is HitlInboxQuery {
  assertValid(validate, value, "HitlInboxQuery");
}
