import { ajv, assertValid } from "../index";
import type { ValidateFunction } from "ajv";

export type OCToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type OCOutput = {
  prompt: string;
  toolcalls: OCToolCall[];
  responses: unknown[];
  diffs: unknown[];
  structured?: unknown;
  usage?: {
    total_tokens: number;
  };
  raw_response?: string;
};

export const OCOutputSchema = {
  type: "object",
  additionalProperties: true,
  required: ["prompt", "toolcalls", "responses", "diffs"],
  properties: {
    prompt: { type: "string" },
    toolcalls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "args"],
        properties: {
          name: { type: "string" },
          args: { type: "object", additionalProperties: true }
        }
      }
    },
    responses: { type: "array", items: {} },
    diffs: { type: "array", items: {} },
    structured: { type: "object", additionalProperties: true },
    usage: {
      type: "object",
      required: ["total_tokens"],
      properties: {
        total_tokens: { type: "integer" }
      }
    }
  }
} as const;

const validate = ajv.compile(OCOutputSchema) as ValidateFunction<OCOutput>;

export function assertOCOutput(value: unknown): asserts value is OCOutput {
  assertValid(validate, value, "OC output");
}
