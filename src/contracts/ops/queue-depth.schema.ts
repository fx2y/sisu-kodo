/* eslint-disable @typescript-eslint/no-explicit-any */
import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type QueueDepthStatus = "ENQUEUED" | "PENDING";

export type QueueDepthQuery = {
  queueName?: string;
  status?: QueueDepthStatus;
  limit?: number;
};

export type QueueDepthRow = {
  queueName: string;
  status: QueueDepthStatus;
  workflowCount: number;
  oldestCreatedAt: number | null;
  newestCreatedAt: number | null;
};

const queueStatuses: QueueDepthStatus[] = ["ENQUEUED", "PENDING"];

const querySchema: JSONSchemaType<QueueDepthQuery> = {
  $id: "QueueDepthQuery.v0",
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    queueName: { type: "string", nullable: true, minLength: 1 },
    status: { type: "string", nullable: true, enum: queueStatuses },
    limit: { type: "integer", nullable: true, minimum: 1, maximum: 200 }
  }
};

const rowSchema: JSONSchemaType<QueueDepthRow> = {
  $id: "QueueDepthRow.v0",
  type: "object",
  additionalProperties: false,
  required: ["queueName", "status", "workflowCount", "oldestCreatedAt", "newestCreatedAt"],
  properties: {
    queueName: { type: "string", minLength: 1 },
    status: { type: "string", enum: queueStatuses },
    workflowCount: { type: "integer", minimum: 0 },
    oldestCreatedAt: { type: "number", nullable: true, minimum: 0 },
    newestCreatedAt: { type: "number", nullable: true, minimum: 0 }
  }
} as any;

const responseSchema: JSONSchemaType<QueueDepthRow[]> = {
  $id: "QueueDepthResponse.v0",
  type: "array",
  items: rowSchema
} as any;

const validateQuery = ajv.compile(querySchema) as ValidateFunction<QueueDepthQuery>;
const validateResponse = ajv.compile(responseSchema) as ValidateFunction<QueueDepthRow[]>;

export function assertQueueDepthQuery(value: unknown): asserts value is QueueDepthQuery {
  assertValid(validateQuery, value, "QueueDepthQuery");
}

export function assertQueueDepthResponse(value: unknown): asserts value is QueueDepthRow[] {
  assertValid(validateResponse, value, "QueueDepthResponse");
}
