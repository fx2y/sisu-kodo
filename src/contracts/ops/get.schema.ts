import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { OpsWorkflowSummary, OpsWorkflowStatus } from "./list.schema";
import type { OpsAuditRow } from "./audit.schema";

export type WorkflowIdParam = {
  id: string;
};

export type GetWorkflowResponse = OpsWorkflowSummary & {
  audit?: OpsAuditRow[];
};

const schema: JSONSchemaType<WorkflowIdParam> = {
  $id: "WorkflowIdParam.v0",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
};

const workflowStatuses: OpsWorkflowStatus[] = [
  "PENDING",
  "SUCCESS",
  "ERROR",
  "MAX_RECOVERY_ATTEMPTS_EXCEEDED",
  "CANCELLED",
  "ENQUEUED"
];

const responseSchema: JSONSchemaType<GetWorkflowResponse> = {
  $id: "GetWorkflowResponse.v1",
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
    updatedAt: { type: "integer", nullable: true, minimum: 0 },
    audit: {
      type: "array",
      nullable: true,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "actor", "reason", "at", "targetWorkflowID"],
        properties: {
          op: { type: "string" },
          actor: { type: "string" },
          reason: { type: "string" },
          at: { type: "string" },
          targetWorkflowID: { type: "string" },
          forkedWorkflowID: { type: "string", nullable: true }
        }
      }
    }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<WorkflowIdParam>;
const validateResponse = ajv.compile(responseSchema) as ValidateFunction<GetWorkflowResponse>;

export function assertWorkflowIdParam(value: unknown): asserts value is WorkflowIdParam {
  assertValid(validate, value, "WorkflowIdParam");
}

export function assertGetWorkflowResponse(value: unknown): asserts value is GetWorkflowResponse {
  assertValid(validateResponse, value, "GetWorkflowResponse");
}
