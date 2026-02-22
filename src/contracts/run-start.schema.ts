import { ajv, assertValid } from "./index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { RecipeRef } from "./recipe.schema";
import { runBudgetSchema, type RunRequest } from "./run-request.schema";

const runBudgetSchemaNullable = {
  type: "object" as const,
  nullable: true as const,
  additionalProperties: false,
  required: runBudgetSchema.required,
  properties: runBudgetSchema.properties
} as const;

export type RunStartRequest = {
  recipeRef: RecipeRef;
  formData: Record<string, unknown>;
  opts?: RunRequest;
};

const schema: JSONSchemaType<RunStartRequest> = {
  $id: "RunStartRequest.v0",
  type: "object",
  additionalProperties: false,
  required: ["recipeRef", "formData"],
  properties: {
    recipeRef: {
      type: "object",
      additionalProperties: false,
      required: ["id", "v"],
      properties: {
        id: { type: "string", minLength: 1 },
        v: { type: "string", minLength: 1 }
      }
    },
    formData: {
      type: "object",
      additionalProperties: true,
      required: []
    },
    opts: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: [],
      properties: {
        traceId: { type: "string", nullable: true },
        queueName: {
          type: "string",
          nullable: true,
          enum: ["compileQ", "sbxQ", "controlQ", "intentQ"]
        },
        lane: {
          type: "string",
          nullable: true,
          enum: ["interactive", "batch"]
        },
        priority: { type: "integer", nullable: true },
        deduplicationID: { type: "string", nullable: true },
        timeoutMS: { type: "integer", nullable: true },
        recipeName: { type: "string", nullable: true },
        recipeVersion: { type: "integer", nullable: true },
        workload: {
          type: "object",
          nullable: true,
          additionalProperties: false,
          required: ["concurrency", "steps", "sandboxMinutes"],
          properties: {
            concurrency: { type: "integer", minimum: 0 },
            steps: { type: "integer", minimum: 0 },
            sandboxMinutes: { type: "integer", minimum: 0 }
          }
        },
        tenantId: { type: "string", nullable: true, minLength: 1 },
        taskKey: { type: "string", nullable: true, minLength: 1 },
        queuePartitionKey: { type: "string", nullable: true, minLength: 1 },
        budget: runBudgetSchemaNullable
      }
    }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<RunStartRequest>;

export function assertRunStartRequest(value: unknown): asserts value is RunStartRequest {
  assertValid(validate, value, "RunStartRequest");
}
