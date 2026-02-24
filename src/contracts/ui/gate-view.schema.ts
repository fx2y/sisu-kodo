import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { GatePrompt } from "../hitl/gate-prompt.schema";
import type { GateResult } from "../hitl/gate-result.schema";

export type GateState = "PENDING" | "RECEIVED" | "TIMED_OUT" | "RESOLVED";

export type GateOrigin =
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

export type GateView = {
  workflowID: string;
  gateKey: string;
  topic: string;
  state: GateState;
  prompt: GatePrompt;
  result?: GateResult | null;
  origin?: GateOrigin | null;
  payloadHash?: string | null;
  createdAt: number;
  deadlineAt: number;
};

const schema: JSONSchemaType<GateView> = {
  $id: "GateView.v2",
  type: "object",
  additionalProperties: false,
  required: ["workflowID", "gateKey", "topic", "state", "prompt", "createdAt", "deadlineAt"],
  properties: {
    workflowID: { type: "string" },
    gateKey: { type: "string" },
    topic: { type: "string", minLength: 1 },
    state: { type: "string", enum: ["PENDING", "RECEIVED", "TIMED_OUT", "RESOLVED"] },
    prompt: {
      type: "object",
      required: ["schemaVersion", "formSchema", "ttlS", "createdAt", "deadlineAt"],
      properties: {
        schemaVersion: { type: "integer", minimum: 1 },
        formSchema: { type: "object", additionalProperties: true, required: [] },
        ttlS: { type: "integer", minimum: 1, maximum: 86400 },
        createdAt: { type: "integer", minimum: 0 },
        deadlineAt: { type: "integer", minimum: 0 },
        uiHints: { type: "object", additionalProperties: true, required: [], nullable: true },
        defaults: { type: "object", additionalProperties: true, required: [], nullable: true }
      },
      additionalProperties: false
    },
    result: {
      type: "object",
      required: ["schemaVersion", "state"],
      properties: {
        schemaVersion: { type: "integer", minimum: 1 },
        state: { type: "string", enum: ["RECEIVED", "TIMED_OUT"] },
        payload: { type: "object", additionalProperties: true, required: [], nullable: true },
        payloadHash: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
        at: { type: "integer", minimum: 0, nullable: true }
      },
      additionalProperties: false,
      nullable: true
    },
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
        "unknown",
        null
      ],
      nullable: true
    },
    payloadHash: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
    createdAt: { type: "integer", minimum: 0 },
    deadlineAt: { type: "integer", minimum: 0 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GateView>;

export function assertGateView(value: unknown): asserts value is GateView {
  assertValid(validate, value, "GateView");
}
