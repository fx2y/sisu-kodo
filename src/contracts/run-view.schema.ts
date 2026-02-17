import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { ArtifactRef } from "./artifact-ref.schema";

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_input"
  | "succeeded"
  | "failed"
  | "canceled";

export type RunStep = {
  stepId: string;
  phase: string;
  output?: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
};

export type RunView = {
  runId: string;
  status: RunStatus;
  steps: RunStep[];
  artifacts: ArtifactRef[];
  traceId?: string;
};

const schema: JSONSchemaType<RunView> = {
  $id: "RunView.v0",
  type: "object",
  additionalProperties: false,
  required: ["runId", "status", "steps", "artifacts"],
  properties: {
    runId: { type: "string" },
    status: {
      type: "string",
      enum: ["queued", "running", "waiting_input", "succeeded", "failed", "canceled"]
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stepId", "phase"],
        properties: {
          stepId: { type: "string" },
          phase: { type: "string" },
          output: { type: "object", additionalProperties: true, required: [], nullable: true },
          startedAt: { type: "string", nullable: true },
          finishedAt: { type: "string", nullable: true }
        }
      }
    },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "sha256"],
        properties: {
          kind: { type: "string" },
          uri: { type: "string", nullable: true },
          inline: { type: "object", additionalProperties: true, required: [], nullable: true },
          sha256: { type: "string" }
        }
      }
    },
    traceId: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<RunView>;

export function assertRunView(value: unknown): asserts value is RunView {
  assertValid(validate, value, "RunView");
}
