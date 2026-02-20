import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ListWorkflowsQuery = {
  status?: string;
  name?: string;
  limit?: number;
};

const schema: JSONSchemaType<ListWorkflowsQuery> = {
  $id: "ListWorkflowsQuery.v0",
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    status: { type: "string", nullable: true },
    name: { type: "string", nullable: true },
    limit: { type: "integer", nullable: true, minimum: 1 }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ListWorkflowsQuery>;

export function assertListWorkflowsQuery(value: unknown): asserts value is ListWorkflowsQuery {
  assertValid(validate, value, "ListWorkflowsQuery");
}
