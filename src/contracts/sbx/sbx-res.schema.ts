import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type SBXRes = {
  exit: number;
  stdout: string;
  stderr: string;
  filesOut: Array<{
    path: string;
    sha256: string;
    inline?: string;
    uri?: string;
  }>;
  metrics: {
    wallMs: number;
    cpuMs: number;
    memPeakMB: number;
  };
  sandboxRef: string;
  errCode:
    | "NONE"
    | "BOOT_FAIL"
    | "CMD_NONZERO"
    | "TIMEOUT"
    | "OOM"
    | "NET_FAIL"
    | "UPLOAD_FAIL"
    | "DOWNLOAD_FAIL";
  taskKey: string;
  artifactIndexRef?: string;
  raw?: Record<string, unknown>;
};

const schema: JSONSchemaType<SBXRes> = {
  $id: "SBXRes.v0",
  type: "object",
  additionalProperties: false,
  required: ["exit", "stdout", "stderr", "filesOut", "metrics", "sandboxRef", "errCode", "taskKey"],
  properties: {
    exit: { type: "number" },
    stdout: { type: "string" },
    stderr: { type: "string" },
    filesOut: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "sha256"],
        properties: {
          path: { type: "string" },
          sha256: { type: "string" },
          inline: { type: "string", nullable: true },
          uri: { type: "string", nullable: true }
        }
      }
    },
    metrics: {
      type: "object",
      additionalProperties: false,
      required: ["wallMs", "cpuMs", "memPeakMB"],
      properties: {
        wallMs: { type: "number" },
        cpuMs: { type: "number" },
        memPeakMB: { type: "number" }
      }
    },
    sandboxRef: { type: "string" },
    errCode: {
      type: "string",
      enum: [
        "NONE",
        "BOOT_FAIL",
        "CMD_NONZERO",
        "TIMEOUT",
        "OOM",
        "NET_FAIL",
        "UPLOAD_FAIL",
        "DOWNLOAD_FAIL"
      ]
    },
    taskKey: { type: "string" },
    artifactIndexRef: { type: "string", nullable: true },
    raw: { type: "object", nullable: true, additionalProperties: true, required: [] }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<SBXRes>;

export function assertSBXRes(value: unknown): asserts value is SBXRes {
  assertValid(validate, value, "SBXRes");
}

export const assertSbxRes = assertSBXRes;
