import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { GatePrompt } from "../hitl/gate-prompt.schema";
import type { GateResult } from "../hitl/gate-result.schema";

export type GateState = "PENDING" | "RECEIVED" | "TIMED_OUT";

export type GateView = {
  workflowID: string;
  gateKey: string;
  state: GateState;
  prompt: GatePrompt;
  result?: GateResult | null;
  deadlineAt: number;
};

const schema: JSONSchemaType<GateView> = {
  $id: "GateView.v1",
  type: "object",
  additionalProperties: false,
  required: ["workflowID", "gateKey", "state", "prompt", "deadlineAt"],
  properties: {
    workflowID: { type: "string" },
    gateKey: { type: "string" },
    state: { type: "string", enum: ["PENDING", "RECEIVED", "TIMED_OUT"] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prompt: { type: "object", additionalProperties: true, required: [] } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: { type: "object", additionalProperties: true, required: [], nullable: true } as any,
    deadlineAt: { type: "integer" }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<GateView>;

export function assertGateView(value: unknown): asserts value is GateView {
  assertValid(validate, value, "GateView");
}
