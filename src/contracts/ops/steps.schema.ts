import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type GetWorkflowStepsParams = {
  id: string;
};

export type WorkflowStepStatus = "PENDING" | "SUCCESS" | "ERROR";

export type WorkflowStepSummary = {
  stepId: string;
  functionId: number;
  status: WorkflowStepStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
};

const schema: JSONSchemaType<GetWorkflowStepsParams> = {
  $id: "GetWorkflowStepsParams.v0",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
};

const stepStatuses: WorkflowStepStatus[] = ["PENDING", "SUCCESS", "ERROR"];

const stepSummarySchema: JSONSchemaType<WorkflowStepSummary> = {
  $id: "WorkflowStepSummary.v0",
  type: "object",
  additionalProperties: false,
  required: ["stepId", "functionId", "status"],
  properties: {
    stepId: { type: "string", minLength: 1 },
    functionId: { type: "integer", minimum: 0 },
    status: { type: "string", enum: stepStatuses },
    startedAt: { type: "number", nullable: true, minimum: 0 },
    completedAt: { type: "number", nullable: true, minimum: 0 },
    error: { type: "string", nullable: true }
  }
};

const responseSchema: JSONSchemaType<WorkflowStepSummary[]> = {
  $id: "GetWorkflowStepsResponse.v0",
  type: "array",
  items: stepSummarySchema
};

const validate = ajv.compile(schema) as ValidateFunction<GetWorkflowStepsParams>;
const validateResponse = ajv.compile(responseSchema) as ValidateFunction<WorkflowStepSummary[]>;

export function assertGetWorkflowStepsParams(
  value: unknown
): asserts value is GetWorkflowStepsParams {
  assertValid(validate, value, "GetWorkflowStepsParams");
}

export function assertGetWorkflowStepsResponse(
  value: unknown
): asserts value is WorkflowStepSummary[] {
  assertValid(validateResponse, value, "GetWorkflowStepsResponse");
}
