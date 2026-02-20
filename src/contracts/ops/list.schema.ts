import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type OpsWorkflowStatus =
  | "PENDING"
  | "SUCCESS"
  | "ERROR"
  | "MAX_RECOVERY_ATTEMPTS_EXCEEDED"
  | "CANCELLED"
  | "ENQUEUED";

export type ListWorkflowsQuery = {
  status?: OpsWorkflowStatus;
  name?: string;
  limit?: number;
};

export type OpsWorkflowSummary = {
  workflowID: string;
  status: OpsWorkflowStatus;
  workflowName: string;
  workflowClassName: string;
  queueName?: string;
  applicationVersion?: string;
  createdAt: number;
  updatedAt?: number;
};

const workflowStatuses: OpsWorkflowStatus[] = [
  "PENDING",
  "SUCCESS",
  "ERROR",
  "MAX_RECOVERY_ATTEMPTS_EXCEEDED",
  "CANCELLED",
  "ENQUEUED"
];

const schema: JSONSchemaType<ListWorkflowsQuery> = {
  $id: "ListWorkflowsQuery.v0",
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    status: { type: "string", nullable: true, enum: workflowStatuses },
    name: { type: "string", nullable: true },
    limit: { type: "integer", nullable: true, minimum: 1 }
  }
};

export const opsWorkflowSummarySchema: JSONSchemaType<OpsWorkflowSummary> = {
  $id: "OpsWorkflowSummary.v0",
  type: "object",
  additionalProperties: false,
  required: ["workflowID", "status", "workflowName", "workflowClassName", "createdAt"],
  properties: {
    workflowID: { type: "string", minLength: 1 },
    status: { type: "string", enum: workflowStatuses },
    workflowName: { type: "string", minLength: 1 },
    workflowClassName: { type: "string", minLength: 1 },
    queueName: { type: "string", nullable: true },
    applicationVersion: { type: "string", nullable: true },
    createdAt: { type: "integer", minimum: 0 },
    updatedAt: { type: "integer", nullable: true, minimum: 0 }
  }
};

const listResponseSchema: JSONSchemaType<OpsWorkflowSummary[]> = {
  $id: "ListWorkflowsResponse.v0",
  type: "array",
  items: opsWorkflowSummarySchema
};

const validate = ajv.compile(schema) as ValidateFunction<ListWorkflowsQuery>;
const validateResponse = ajv.compile(listResponseSchema) as ValidateFunction<OpsWorkflowSummary[]>;

export function assertListWorkflowsQuery(value: unknown): asserts value is ListWorkflowsQuery {
  assertValid(validate, value, "ListWorkflowsQuery");
}

export function assertListWorkflowsResponse(value: unknown): asserts value is OpsWorkflowSummary[] {
  assertValid(validateResponse, value, "ListWorkflowsResponse");
}
