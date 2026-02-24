import { ajv } from "../ajv";
import { assertValid } from "../assert";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type SignoffVerdict = "GO" | "NO_GO";

export type SignoffTile = {
  id: string;
  label: string;
  verdict: SignoffVerdict;
  evidenceRefs: string[]; // List of ProofCard IDs or similar
  reason?: string;
  ts: number;
};

const schema: JSONSchemaType<SignoffTile> = {
  $id: "SignoffTile.v1",
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "verdict", "evidenceRefs", "ts"],
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    verdict: {
      type: "string",
      enum: ["GO", "NO_GO"]
    },
    evidenceRefs: {
      type: "array",
      items: { type: "string" }
    },
    reason: { type: "string", nullable: true },
    ts: { type: "number" }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<SignoffTile>;

export function assertSignoffTile(value: unknown): asserts value is SignoffTile {
  assertValid(validate, value, "SignoffTile");
}
