import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ArtifactRefV1 = {
  id: string;
  workflowID: string;
  stepID?: string;
  kind: string;
  mime: string;
  size: number;
  previewHint?: string;
  storageKey?: string;
};

const schema: JSONSchemaType<ArtifactRefV1> = {
  $id: "ArtifactRef.v1",
  type: "object",
  additionalProperties: false,
  required: ["id", "workflowID", "kind", "mime", "size"],
  properties: {
    id: { type: "string" },
    workflowID: { type: "string" },
    stepID: { type: "string", nullable: true },
    kind: { type: "string" },
    mime: { type: "string" },
    size: { type: "number" },
    previewHint: { type: "string", nullable: true },
    storageKey: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ArtifactRefV1>;

export function assertArtifactRefV1(value: unknown): asserts value is ArtifactRefV1 {
  assertValid(validate, value, "ArtifactRefV1");
}
