import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type RecipeRegistryRow = {
  id: string;
  name: string;
  latestV: string;
  status: "draft" | "candidate" | "stable";
  updatedAt: number;
};

export type RecipeRegistryVersionRow = {
  id: string;
  v: string;
  hash: string;
  status: "draft" | "candidate" | "stable";
  createdAt: number;
  evalCount: number;
  fixtureCount: number;
};

const registryRowSchema: JSONSchemaType<RecipeRegistryRow> = {
  $id: "RecipeRegistryRow.v0",
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "latestV", "status", "updatedAt"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    latestV: { type: "string" },
    status: { type: "string", enum: ["draft", "candidate", "stable"] },
    updatedAt: { type: "integer" }
  }
};

const registryVersionRowSchema: JSONSchemaType<RecipeRegistryVersionRow> = {
  $id: "RecipeRegistryVersionRow.v0",
  type: "object",
  additionalProperties: false,
  required: ["id", "v", "hash", "status", "createdAt", "evalCount", "fixtureCount"],
  properties: {
    id: { type: "string" },
    v: { type: "string" },
    hash: { type: "string" },
    status: { type: "string", enum: ["draft", "candidate", "stable"] },
    createdAt: { type: "integer" },
    evalCount: { type: "integer" },
    fixtureCount: { type: "integer" }
  }
};

const validateRegistryRow = ajv.compile(registryRowSchema) as ValidateFunction<RecipeRegistryRow>;
const validateRegistryVersionRow = ajv.compile(
  registryVersionRowSchema
) as ValidateFunction<RecipeRegistryVersionRow>;

export function assertRecipeRegistryRow(value: unknown): asserts value is RecipeRegistryRow {
  assertValid(validateRegistryRow, value, "RecipeRegistryRow");
}

export function assertRecipeRegistryVersionRow(
  value: unknown
): asserts value is RecipeRegistryVersionRow {
  assertValid(validateRegistryVersionRow, value, "RecipeRegistryVersionRow");
}
