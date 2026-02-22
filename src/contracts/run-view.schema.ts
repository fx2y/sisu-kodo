import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { ArtifactRef } from "./artifact-ref.schema";

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_input"
  | "succeeded"
  | "failed"
  | "canceled"
  | "retries_exceeded"
  | "repairing";

export type RunStep = {
  stepId: string;
  phase: string;
  output?: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  traceId?: string | null;
  spanId?: string | null;
};

export type RunView = {
  runId: string;
  workflowId: string;
  recipeRef?: { id: string; v: string } | null;
  recipeHash?: string | null;
  intentHash?: string | null;
  status: RunStatus;
  steps: RunStep[];
  artifacts: ArtifactRef[];
  traceId?: string | null;
  lastStep?: string;
  error?: string;
  retryCount: number;
  nextAction?: string;
};

const schema: JSONSchemaType<RunView> = {
  $id: "RunView.v0",
  type: "object",
  additionalProperties: false,
  required: ["runId", "workflowId", "status", "steps", "artifacts", "retryCount"],
  properties: {
    runId: { type: "string" },
    workflowId: { type: "string" },
    recipeRef: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: ["id", "v"],
      properties: {
        id: { type: "string" },
        v: { type: "string" }
      }
    },
    recipeHash: { type: "string", nullable: true },
    intentHash: { type: "string", nullable: true },
    status: {
      type: "string",
      enum: [
        "queued",
        "running",
        "waiting_input",
        "succeeded",
        "failed",
        "canceled",
        "retries_exceeded",
        "repairing"
      ]
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
          finishedAt: { type: "string", nullable: true },
          traceId: { type: "string", nullable: true },
          spanId: { type: "string", nullable: true }
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
    traceId: { type: "string", nullable: true },
    lastStep: { type: "string", nullable: true },
    error: { type: "string", nullable: true },
    retryCount: { type: "integer" },
    nextAction: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<RunView>;

export function assertRunView(value: unknown): asserts value is RunView {
  assertValid(validate, value, "RunView");
}
