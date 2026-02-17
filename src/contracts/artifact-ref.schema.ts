import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ArtifactRef = {
  kind: string;
  uri?: string;
  inline?: Record<string, unknown>;
  sha256: string;
};

const schema: JSONSchemaType<ArtifactRef> = {
  $id: "ArtifactRef.v0",
  type: "object",
  additionalProperties: false,
  required: ["kind", "sha256"],
  properties: {
    kind: { type: "string" },
    uri: { type: "string", nullable: true },
    inline: { type: "object", additionalProperties: true, required: [], nullable: true },
    sha256: { type: "string" }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ArtifactRef>;

export function assertArtifactRef(value: unknown): asserts value is ArtifactRef {
  assertValid(validate, value, "ArtifactRef");
}
