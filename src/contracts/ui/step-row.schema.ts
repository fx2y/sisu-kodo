import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { ArtifactRefV1 } from "./artifact-ref-v1.schema";

export type StepRow = {
  stepID: string;
  name: string;
  attempt: number;
  startedAt: number; // epoch ms
  endedAt?: number; // epoch ms
  error?: any;
  artifactRefs: ArtifactRefV1[];
};

const schema: JSONSchemaType<StepRow> = {
  $id: "StepRow.v1",
  type: "object",
  additionalProperties: false,
  required: ["stepID", "name", "attempt", "startedAt", "artifactRefs"],
  properties: {
    stepID: { type: "string" },
    name: { type: "string" },
    attempt: { type: "number" },
    startedAt: { type: "number" },
    endedAt: { type: "number", nullable: true },
    error: { type: "object", additionalProperties: true, required: [], nullable: true },
    artifactRefs: {
      type: "array",
      items: {
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
      }
    }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<StepRow>;

export function assertStepRow(value: unknown): asserts value is StepRow {
  assertValid(validate, value, "StepRow");
}
