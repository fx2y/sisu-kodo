import type { JSONSchemaType, ValidateFunction } from "ajv";
import { ajv, assertValid } from "./index";

export type EvalCheck =
  | { id: string; kind: "file_exists"; glob: string }
  | { id: string; kind: "jsonschema"; artifact: string; schema: Record<string, unknown> }
  | { id: string; kind: "rowcount_gte"; artifact: string; n: number }
  | { id: string; kind: "regex"; artifact: string; re: string }
  | { id: string; kind: "diff_le"; artifactA: string; artifactB: string; max: number };

export type EvalCheckResult = {
  checkId: string;
  pass: boolean;
  reason: string;
  payload?: Record<string, unknown>;
};

const evalCheckSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "glob"],
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { const: "file_exists" },
        glob: { type: "string", minLength: 1 }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "artifact", "schema"],
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { const: "jsonschema" },
        artifact: { type: "string", minLength: 1 },
        schema: { type: "object", additionalProperties: true }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "artifact", "n"],
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { const: "rowcount_gte" },
        artifact: { type: "string", minLength: 1 },
        n: { type: "integer", minimum: 0 }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "artifact", "re"],
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { const: "regex" },
        artifact: { type: "string", minLength: 1 },
        re: { type: "string", minLength: 1 }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "artifactA", "artifactB", "max"],
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { const: "diff_le" },
        artifactA: { type: "string", minLength: 1 },
        artifactB: { type: "string", minLength: 1 },
        max: { type: "number", minimum: 0 }
      }
    }
  ]
} as const;

const evalResultSchema: JSONSchemaType<EvalCheckResult> = {
  $id: "EvalCheckResult.v0",
  type: "object",
  additionalProperties: false,
  required: ["checkId", "pass", "reason"],
  properties: {
    checkId: { type: "string", minLength: 1 },
    pass: { type: "boolean" },
    reason: { type: "string" },
    payload: { type: "object", nullable: true, additionalProperties: true }
  }
};

const validateEvalCheck = ajv.compile(evalCheckSchema) as ValidateFunction<EvalCheck>;
const validateEvalResult = ajv.compile(evalResultSchema) as ValidateFunction<EvalCheckResult>;

export function assertEvalCheck(value: unknown): asserts value is EvalCheck {
  assertValid(validateEvalCheck, value, "EvalCheck");
}

export function assertEvalChecks(value: unknown): asserts value is EvalCheck[] {
  if (!Array.isArray(value)) throw new Error("EvalCheck[]: expected array");
  value.forEach((v) => assertEvalCheck(v));
}

export function assertEvalCheckResult(value: unknown): asserts value is EvalCheckResult {
  assertValid(validateEvalResult, value, "EvalCheckResult");
}

export function assertEvalCheckResults(value: unknown): asserts value is EvalCheckResult[] {
  if (!Array.isArray(value)) throw new Error("EvalCheckResult[]: expected array");
  value.forEach((v) => assertEvalCheckResult(v));
}
