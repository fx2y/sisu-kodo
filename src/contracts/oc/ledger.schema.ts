import { ajv, assertValid } from "../index";
import type { ValidateFunction } from "ajv";

export type OCLedgerEntry = {
  opKey: string;
  runId: string;
  stepId: string;
  sessionId: string;
  agent: string;
  schemaHash: string;
  prompt: string;
  structured: Record<string, unknown>;
  raw?: string;
  toolcalls?: {
    name: string;
    args: Record<string, unknown>;
  }[];
  ms: number;
  err?: Record<string, unknown>;
};

export const OCLedgerSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "opKey",
    "runId",
    "stepId",
    "sessionId",
    "agent",
    "schemaHash",
    "prompt",
    "structured",
    "ms"
  ],
  properties: {
    opKey: { type: "string" },
    runId: { type: "string" },
    stepId: { type: "string" },
    sessionId: { type: "string" },
    agent: { type: "string" },
    schemaHash: { type: "string" },
    prompt: { type: "string" },
    structured: { type: "object", additionalProperties: true },
    raw: { type: "string" },
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
    ms: { type: "number" },
    err: { type: "object", additionalProperties: true }
  }
} as const;

const validate = ajv.compile(OCLedgerSchema) as ValidateFunction<OCLedgerEntry>;

export function assertOCLedgerEntry(value: unknown): asserts value is OCLedgerEntry {
  assertValid(validate, value, "OC ledger entry");
}
