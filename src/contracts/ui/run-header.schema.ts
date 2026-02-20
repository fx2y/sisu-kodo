import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type RunHeaderStatus = "PENDING" | "ENQUEUED" | "SUCCESS" | "ERROR" | "CANCELLED";

export type RunHeader = {
  workflowID: string;
  status: RunHeaderStatus;
  workflowName?: string;
  createdAt?: number;
  updatedAt?: number;
  queue?: string;
  priority?: number;
  error?: Record<string, unknown>;
  output?: Record<string, unknown>;
  traceId?: string | null;
  spanId?: string | null;
  traceBaseUrl?: string;
  nextAction?: string | null;
};

const schema: JSONSchemaType<RunHeader> = {
  $id: "RunHeader.v1",
  type: "object",
  additionalProperties: false,
  required: ["workflowID", "status"],
  properties: {
    workflowID: { type: "string" },
    status: {
      type: "string",
      enum: ["PENDING", "ENQUEUED", "SUCCESS", "ERROR", "CANCELLED"]
    },
    workflowName: { type: "string", nullable: true },
    createdAt: { type: "number", nullable: true },
    updatedAt: { type: "number", nullable: true },
    queue: { type: "string", nullable: true },
    priority: { type: "number", nullable: true },
    error: { type: "object", additionalProperties: true, required: [], nullable: true },
    output: { type: "object", additionalProperties: true, required: [], nullable: true },
    traceId: { type: "string", nullable: true },
    spanId: { type: "string", nullable: true },
    traceBaseUrl: { type: "string", nullable: true },
    nextAction: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<RunHeader>;

export function assertRunHeader(value: unknown): asserts value is RunHeader {
  assertValid(validate, value, "RunHeader");
}
