import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GateKey = string;

const schema: JSONSchemaType<GateKey> = {
  $id: "HitlGateKey.v1",
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[a-z0-9][a-z0-9:_-]{0,127}$"
};

const validate = ajv.compile(schema) as ValidateFunction<GateKey>;

export function assertGateKey(value: unknown): asserts value is GateKey {
  assertValid(validate, value, "HitlGateKey");
}
