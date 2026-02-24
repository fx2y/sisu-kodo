import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ThroughputMetricType = "queue-depth" | "fairness" | "priority-delta" | "budget-event" | "template-stats" | "k6-artifact";

export type ThroughputRow = {
  type: ThroughputMetricType;
  label: string;
  value: number | string;
  unit?: string;
  provenance: string;
  ts: number;
  metadata?: Record<string, unknown>;
};

const schema: JSONSchemaType<ThroughputRow> = {
  $id: "ThroughputRow.v1",
  type: "object",
  additionalProperties: false,
  required: ["type", "label", "value", "provenance", "ts"],
  properties: {
    type: {
      type: "string",
      enum: ["queue-depth", "fairness", "priority-delta", "budget-event", "template-stats", "k6-artifact"]
    },
    label: { type: "string" },
    value: { oneOf: [{ type: "number" }, { type: "string" }] } as any,
    unit: { type: "string", nullable: true },
    provenance: { type: "string" },
    ts: { type: "number" },
    metadata: { type: "object", additionalProperties: true, required: [], nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ThroughputRow>;

export function assertThroughputRow(value: unknown): asserts value is ThroughputRow {
  assertValid(validate, value, "ThroughputRow");
}
