import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type PlanApprovalRequest = {
  approvedBy: string;
  notes?: string;
};

const schema: JSONSchemaType<PlanApprovalRequest> = {
  $id: "PlanApprovalRequest.v0",
  type: "object",
  required: ["approvedBy"],
  properties: {
    approvedBy: { type: "string", minLength: 1 },
    notes: { type: "string", nullable: true }
  },
  additionalProperties: false
};

const validate = ajv.compile(schema) as ValidateFunction<PlanApprovalRequest>;

export function assertPlanApprovalRequest(value: unknown): asserts value is PlanApprovalRequest {
  assertValid(validate, value, "PlanApprovalRequest");
}
