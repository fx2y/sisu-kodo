import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type SBXReq = {
  envRef: string;
  cmd: string;
  filesIn: Array<{
    path: string;
    inline?: string;
    uri?: string;
  }>;
  env: Record<string, string>;
  workdir?: string;
  timeoutMs: number;
  limits: {
    cpu: number;
    memMB: number;
  };
  net: boolean;
  taskKey: string;
};

const schema: JSONSchemaType<SBXReq> = {
  $id: "SBXReq.v0",
  type: "object",
  additionalProperties: false,
  required: ["envRef", "cmd", "filesIn", "env", "timeoutMs", "limits", "net", "taskKey"],
  properties: {
    envRef: { type: "string" },
    cmd: { type: "string" },
    filesIn: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string" },
          inline: { type: "string", nullable: true },
          uri: { type: "string", nullable: true }
        }
      }
    },
    env: { type: "object", additionalProperties: { type: "string" }, required: [] },
    workdir: { type: "string", nullable: true },
    timeoutMs: { type: "number" },
    limits: {
      type: "object",
      additionalProperties: false,
      required: ["cpu", "memMB"],
      properties: {
        cpu: { type: "number" },
        memMB: { type: "number" }
      }
    },
    net: { type: "boolean" },
    taskKey: { type: "string" }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<SBXReq>;

export function assertSBXReq(value: unknown): asserts value is SBXReq {
  assertValid(validate, value, "SBXReq");
}

export const assertSbxReq = assertSBXReq;
