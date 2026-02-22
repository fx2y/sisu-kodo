import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { EvalCheck } from "./eval.schema";

export type RecipeRef = {
  id: string;
  v: string;
};

export type RecipeLimits = {
  maxSteps: number;
  maxFanout: number;
  maxSbxMin: number;
  maxTokens: number;
};

export type RecipeFixture = {
  id: string;
  formData: Record<string, unknown>;
};

export type RecipeEvalCheck = EvalCheck;

export type RecipeSpec = {
  id: string;
  v: string;
  name: string;
  tags?: string[];
  formSchema: Record<string, unknown>;
  intentTmpl: Record<string, unknown>;
  wfEntry: string;
  queue: "compileQ" | "sbxQ" | "controlQ" | "intentQ";
  limits: RecipeLimits;
  eval: RecipeEvalCheck[];
  fixtures: RecipeFixture[];
  prompts: {
    compile: string;
    postmortem: string;
  };
};

export type RecipeBundle = {
  id: string;
  versions: RecipeSpec[];
};

export type RecipeExportRequest = {
  id: string;
};

const recipeRefSchema: JSONSchemaType<RecipeRef> = {
  $id: "RecipeRef.v0",
  type: "object",
  additionalProperties: false,
  required: ["id", "v"],
  properties: {
    id: { type: "string", minLength: 1 },
    v: { type: "string", minLength: 1 }
  }
};

const limitsSchema: JSONSchemaType<RecipeLimits> = {
  type: "object",
  additionalProperties: false,
  required: ["maxSteps", "maxFanout", "maxSbxMin", "maxTokens"],
  properties: {
    maxSteps: { type: "integer", minimum: 1 },
    maxFanout: { type: "integer", minimum: 1 },
    maxSbxMin: { type: "integer", minimum: 1 },
    maxTokens: { type: "integer", minimum: 1 }
  }
};

const fixtureSchema: JSONSchemaType<RecipeFixture> = {
  type: "object",
  additionalProperties: false,
  required: ["id", "formData"],
  properties: {
    id: { type: "string", minLength: 1 },
    formData: { type: "object", additionalProperties: true, required: [] }
  }
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

const recipeSchema: JSONSchemaType<RecipeSpec> = {
  $id: "RecipeSpec.v0",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "v",
    "name",
    "formSchema",
    "intentTmpl",
    "wfEntry",
    "queue",
    "limits",
    "eval",
    "fixtures",
    "prompts"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    v: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    tags: { type: "array", items: { type: "string", minLength: 1 }, nullable: true },
    formSchema: { type: "object", additionalProperties: true, required: [] },
    intentTmpl: { type: "object", additionalProperties: true, required: [] },
    wfEntry: { type: "string", minLength: 1 },
    queue: { type: "string", enum: ["compileQ", "sbxQ", "controlQ", "intentQ"] },
    limits: limitsSchema,
    eval: { type: "array", items: evalCheckSchema as never },
    fixtures: { type: "array", items: fixtureSchema },
    prompts: {
      type: "object",
      additionalProperties: false,
      required: ["compile", "postmortem"],
      properties: {
        compile: { type: "string", minLength: 1 },
        postmortem: { type: "string", minLength: 1 }
      }
    }
  }
};

const recipeBundleSchema: JSONSchemaType<RecipeBundle> = {
  $id: "RecipeBundle.v0",
  type: "object",
  additionalProperties: false,
  required: ["id", "versions"],
  properties: {
    id: { type: "string", minLength: 1 },
    versions: { type: "array", minItems: 1, items: recipeSchema }
  }
};

const recipeExportRequestSchema: JSONSchemaType<RecipeExportRequest> = {
  $id: "RecipeExportRequest.v0",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 }
  }
};

const validateRecipeRef = ajv.compile(recipeRefSchema) as ValidateFunction<RecipeRef>;
const validateRecipeSpec = ajv.compile(recipeSchema) as ValidateFunction<RecipeSpec>;
const validateRecipeFixture = ajv.compile(fixtureSchema) as ValidateFunction<RecipeFixture>;
const validateRecipeBundle = ajv.compile(recipeBundleSchema) as ValidateFunction<RecipeBundle>;
const validateRecipeExportRequest = ajv.compile(
  recipeExportRequestSchema
) as ValidateFunction<RecipeExportRequest>;

export function assertRecipeRef(value: unknown): asserts value is RecipeRef {
  assertValid(validateRecipeRef, value, "RecipeRef");
}

export function assertRecipeSpec(value: unknown): asserts value is RecipeSpec {
  assertValid(validateRecipeSpec, value, "RecipeSpec");
}

export function assertRecipeFixture(value: unknown): asserts value is RecipeFixture {
  assertValid(validateRecipeFixture, value, "RecipeFixture");
}

export function assertRecipeBundle(value: unknown): asserts value is RecipeBundle {
  assertValid(validateRecipeBundle, value, "RecipeBundle");
}

export function assertRecipeExportRequest(value: unknown): asserts value is RecipeExportRequest {
  assertValid(validateRecipeExportRequest, value, "RecipeExportRequest");
}
