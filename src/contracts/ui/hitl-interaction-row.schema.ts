import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type HitlInteractionRow = {
  workflowID: string;
  gateKey: string;
  topic: string;
  dedupeKey: string;
  payloadHash: string;
  origin:
    | "manual"
    | "engine-dbos"
    | "api-shim"
    | "legacy-event"
    | "poller-ci"
    | "legacy-approve"
    | "webhook"
    | "webhook-ci"
    | "external"
    | "unknown";
  createdAt: number;
};

const schema: JSONSchemaType<HitlInteractionRow> = {
  $id: "HitlInteractionRow.v1",
  type: "object",
  additionalProperties: false,
  required: ["workflowID", "gateKey", "topic", "dedupeKey", "payloadHash", "origin", "createdAt"],
  properties: {
    workflowID: { type: "string" },
    gateKey: { type: "string" },
    topic: { type: "string" },
    dedupeKey: { type: "string", minLength: 1, maxLength: 256 },
    payloadHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    origin: {
      type: "string",
      enum: [
        "manual",
        "engine-dbos",
        "api-shim",
        "legacy-event",
        "poller-ci",
        "legacy-approve",
        "webhook",
        "webhook-ci",
        "external",
        "unknown"
      ]
    },
    createdAt: { type: "number", minimum: 0 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<HitlInteractionRow>;

export function assertHitlInteractionRow(value: unknown): asserts value is HitlInteractionRow {
  assertValid(validate, value, "HitlInteractionRow");
}
