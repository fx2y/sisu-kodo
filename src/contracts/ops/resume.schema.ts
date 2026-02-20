import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ResumeWorkflowParams = {
  id: string;
};

const schema: JSONSchemaType<ResumeWorkflowParams> = {
  $id: "ResumeWorkflowParams.v0",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ResumeWorkflowParams>;

export function assertResumeWorkflowParams(value: unknown): asserts value is ResumeWorkflowParams {
  assertValid(validate, value, "ResumeWorkflowParams");
}
