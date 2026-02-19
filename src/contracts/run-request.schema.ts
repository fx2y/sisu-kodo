import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type RunRequest = {
  traceId?: string;
  queueName?: "compileQ" | "sbxQ" | "controlQ" | "intentQ";
  priority?: number;
  deduplicationID?: string;
  timeoutMS?: number;
  recipeName?: string;
  recipeVersion?: number;
  workload?: {
    concurrency: number;
    steps: number;
    sandboxMinutes: number;
  };
  /** Optional tenant identifier for resource partitioning. Currently no-op. */
  tenantId?: string;
  /** Unique key for the specific task within a run. Currently no-op. */
  taskKey?: string;
  /** Key used for DBOS queue partitioning. Currently no-op. */
  queuePartitionKey?: string;
};

const schema: JSONSchemaType<RunRequest> = {
  $id: "RunRequest.v0",
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    traceId: { type: "string", nullable: true },
    queueName: {
      type: "string",
      nullable: true,
      enum: ["compileQ", "sbxQ", "controlQ", "intentQ"]
    },
    priority: { type: "integer", nullable: true },
    deduplicationID: { type: "string", nullable: true },
    timeoutMS: { type: "integer", nullable: true },
    recipeName: { type: "string", nullable: true },
    recipeVersion: { type: "integer", nullable: true },
    workload: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: ["concurrency", "steps", "sandboxMinutes"],
      properties: {
        concurrency: { type: "integer", minimum: 0 },
        steps: { type: "integer", minimum: 0 },
        sandboxMinutes: { type: "integer", minimum: 0 }
      }
    },
    tenantId: { type: "string", nullable: true },
    taskKey: { type: "string", nullable: true },
    queuePartitionKey: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<RunRequest>;

export function assertRunRequest(value: unknown): asserts value is RunRequest {
  assertValid(validate, value, "RunRequest");
}
