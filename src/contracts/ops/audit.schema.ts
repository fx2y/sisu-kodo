import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type OpsAuditRow = {
  op: string;
  actor: string;
  reason: string;
  at: string;
  targetWorkflowID: string;
  forkedWorkflowID?: string;
};

const schema: JSONSchemaType<OpsAuditRow[]> = {
  $id: "OpsAuditResponse.v0",
  type: "array",
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
};

const validate = ajv.compile(schema) as ValidateFunction<OpsAuditRow[]>;

export function assertOpsAuditResponse(value: unknown): asserts value is OpsAuditRow[] {
  assertValid(validate, value, "OpsAuditResponse");
}
