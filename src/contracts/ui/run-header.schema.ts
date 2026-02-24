import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type RunHeaderStatus =
  | "PENDING"
  | "ENQUEUED"
  | "SUCCESS"
  | "ERROR"
  | "CANCELLED"
  | "WAITING_INPUT";

export type RunHeader = {
  workflowID: string;
  recipeRef?: { id: string; v: string } | null;
  recipeHash?: string | null;
  intentHash?: string | null;
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
  lastStep?: string | null;
  // Posture fields
  topology?: "api-shim" | "inproc-worker" | null;
  runtimeMode?: "api-shim" | "inproc-worker" | null;
  ocMode?: "replay" | "record" | "live" | null;
  sbxMode?: "mock" | "live" | null;
  sbxProvider?: "e2b" | "microsandbox" | null;
  appVersion?: string | null;
  claimScope?: "signoff" | "demo" | "live-smoke" | null;
  durableStatus?: string | null;
};

const schema: JSONSchemaType<RunHeader> = {
  $id: "RunHeader.v1",
  type: "object",
  additionalProperties: false,
  required: ["workflowID", "status"],
  properties: {
    workflowID: { type: "string" },
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
      enum: ["PENDING", "ENQUEUED", "SUCCESS", "ERROR", "CANCELLED", "WAITING_INPUT"]
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
    nextAction: { type: "string", nullable: true },
    lastStep: { type: "string", nullable: true },
    topology: { type: "string", enum: ["api-shim", "inproc-worker", null], nullable: true },
    runtimeMode: {
      type: "string",
      enum: ["api-shim", "inproc-worker", null],
      nullable: true
    },
    ocMode: { type: "string", enum: ["replay", "record", "live", null], nullable: true },
    sbxMode: { type: "string", enum: ["mock", "live", null], nullable: true },
    sbxProvider: { type: "string", enum: ["e2b", "microsandbox", null], nullable: true },
    appVersion: { type: "string", nullable: true },
    claimScope: {
      type: "string",
      enum: ["signoff", "demo", "live-smoke", null],
      nullable: true
    },
    durableStatus: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<RunHeader>;

export function assertRunHeader(value: unknown): asserts value is RunHeader {
  assertValid(validate, value, "RunHeader");
}
