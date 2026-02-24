import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type HitlInboxRow = {
  workflowID: string;
  gateKey: string;
  topic: string;
  deadline?: number | null;
  slaStatus?: "NORMAL" | "WARNING" | "CRITICAL";
  escalationWorkflowID?: string | null;
  mismatchRisk?: boolean;
  createdAt: number;
};

const schema: JSONSchemaType<HitlInboxRow> = {
  $id: "HitlInboxRow.v1",
  type: "object",
  additionalProperties: false,
  required: ["workflowID", "gateKey", "topic", "createdAt"],
  properties: {
    workflowID: { type: "string" },
    gateKey: { type: "string" },
    topic: { type: "string" },
    deadline: { type: "number", nullable: true },
    slaStatus: {
      type: "string",
      enum: ["NORMAL", "WARNING", "CRITICAL"],
      nullable: true
    },
    escalationWorkflowID: { type: "string", nullable: true },
    mismatchRisk: { type: "boolean", nullable: true },
    createdAt: { type: "number" }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<HitlInboxRow>;

export function assertHitlInboxRow(value: unknown): asserts value is HitlInboxRow {
  assertValid(validate, value, "HitlInboxRow");
}
