import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GateGetQuery = {
  timeoutS?: number | null;
};

const schema: JSONSchemaType<GateGetQuery> = {
  $id: "HitlGateGetQuery.v1",
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    timeoutS: { type: "integer", minimum: 0, maximum: 30, nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GateGetQuery>;

export function assertGateGetQuery(value: unknown): asserts value is GateGetQuery {
  assertValid(validate, value, "HitlGateGetQuery");
}
