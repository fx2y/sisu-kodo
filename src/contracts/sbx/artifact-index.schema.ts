import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ArtifactIndex = {
  taskKey: string;
  provider: string;
  items: Array<{
    kind: string;
    uri: string;
    sha256: string;
  }>;
  rawRef: string;
  createdAt: string;
};

const schema: JSONSchemaType<ArtifactIndex> = {
  $id: "ArtifactIndex.v0",
  type: "object",
  additionalProperties: false,
  required: ["taskKey", "provider", "items", "rawRef", "createdAt"],
  properties: {
    taskKey: { type: "string" },
    provider: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "uri", "sha256"],
        properties: {
          kind: { type: "string" },
          uri: { type: "string" },
          sha256: { type: "string" }
        }
      }
    },
    rawRef: { type: "string" },
    createdAt: { type: "string" }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ArtifactIndex>;

export function assertArtifactIndex(value: unknown): asserts value is ArtifactIndex {
  assertValid(validate, value, "ArtifactIndex");
}

export const assertSbxArtifactIndex = assertArtifactIndex;
