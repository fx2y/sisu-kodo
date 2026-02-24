/* eslint-disable @typescript-eslint/no-explicit-any */
import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type FairnessRow = {
  queueName: string;
  partitionKey: string | null;
  status: string;
  workflowCount: number;
  oldestCreatedAt: number | null;
  newestCreatedAt: number | null;
};

export type PriorityRow = {
  queueName: string;
  priority: number;
  status: string;
  workflowCount: number;
  avgLatencyMs: number | null;
};

export type BudgetEvent = {
  runId: string;
  metric: string;
  limit: number;
  observed: number;
  outcome: string;
  ts: number;
};

export type TemplateStat = {
  recipeId: string;
  recipeV: string;
  templateKey: string;
  runCount: number;
  avgBootMs: number | null;
  avgExecMs: number | null;
};

export type K6Trend = {
  name: string;
  p95: number;
  p99: number;
  avg: number;
  threshold: string;
  pass: boolean;
  ts: number;
};

export type ThroughputResponse = {
  fairness: FairnessRow[];
  priority: PriorityRow[];
  budgets: BudgetEvent[];
  templates: TemplateStat[];
  k6: K6Trend[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fairnessSchema: JSONSchemaType<FairnessRow[]> = {
  $id: "ThroughputFairness.v0",
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "queueName",
      "partitionKey",
      "status",
      "workflowCount",
      "oldestCreatedAt",
      "newestCreatedAt"
    ],
    properties: {
      queueName: { type: "string" },
      partitionKey: { type: "string", nullable: true },
      status: { type: "string" },
      workflowCount: { type: "integer" },
      oldestCreatedAt: { type: "number", nullable: true },
      newestCreatedAt: { type: "number", nullable: true }
    }
  }
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prioritySchema: JSONSchemaType<PriorityRow[]> = {
  $id: "ThroughputPriority.v0",
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["queueName", "priority", "status", "workflowCount", "avgLatencyMs"],
    properties: {
      queueName: { type: "string" },
      priority: { type: "integer" },
      status: { type: "string" },
      workflowCount: { type: "integer" },
      avgLatencyMs: { type: "number", nullable: true }
    }
  }
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const budgetSchema: JSONSchemaType<BudgetEvent[]> = {
  $id: "ThroughputBudget.v0",
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["runId", "metric", "limit", "observed", "outcome", "ts"],
    properties: {
      runId: { type: "string" },
      metric: { type: "string" },
      limit: { type: "number" },
      observed: { type: "number" },
      outcome: { type: "string" },
      ts: { type: "number" }
    }
  }
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const templateSchema: JSONSchemaType<TemplateStat[]> = {
  $id: "ThroughputTemplate.v0",
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["recipeId", "recipeV", "templateKey", "runCount", "avgBootMs", "avgExecMs"],
    properties: {
      recipeId: { type: "string" },
      recipeV: { type: "string" },
      templateKey: { type: "string" },
      runCount: { type: "integer" },
      avgBootMs: { type: "number", nullable: true },
      avgExecMs: { type: "number", nullable: true }
    }
  }
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const k6Schema: JSONSchemaType<K6Trend[]> = {
  $id: "ThroughputK6.v0",
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["name", "p95", "p99", "avg", "threshold", "pass", "ts"],
    properties: {
      name: { type: "string" },
      p95: { type: "number" },
      p99: { type: "number" },
      avg: { type: "number" },
      threshold: { type: "string" },
      pass: { type: "boolean" },
      ts: { type: "number" }
    }
  }
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const throughputResponseSchema: JSONSchemaType<ThroughputResponse> = {
  $id: "ThroughputResponse.v0",
  type: "object",
  additionalProperties: false,
  required: ["fairness", "priority", "budgets", "templates", "k6"],
  properties: {
    fairness: { $ref: "ThroughputFairness.v0" } as any,
    priority: { $ref: "ThroughputPriority.v0" } as any,
    budgets: { $ref: "ThroughputBudget.v0" } as any,
    templates: { $ref: "ThroughputTemplate.v0" } as any,
    k6: { $ref: "ThroughputK6.v0" } as any
  }
} as any;

ajv.addSchema(fairnessSchema);
ajv.addSchema(prioritySchema);
ajv.addSchema(budgetSchema);
ajv.addSchema(templateSchema);
ajv.addSchema(k6Schema);

const validateResponse = ajv.compile(
  throughputResponseSchema
) as ValidateFunction<ThroughputResponse>;

export function assertThroughputResponse(value: unknown): asserts value is ThroughputResponse {
  assertValid(validateResponse, value, "ThroughputResponse");
}
