import type { Pool } from "pg";
import type { RunRequest } from "../contracts/run-request.schema";
import type { RecipeRef } from "../contracts/recipe.schema";
import { findRecipeByName, findVersion } from "../db/recipeRepo";
import { getConfig } from "../config";
import type { IntentQueueName } from "./intent-enqueue";
import { isPartitionedQueue, isPriorityEnabledQueue } from "./dbos/queues";
import { assertIngressBudget, BudgetGuardError } from "./budget-guard";

export type QueueName = IntentQueueName;
type RunLane = NonNullable<RunRequest["lane"]>;
type RecipePolicySource = {
  name: string;
  version: number;
  queueName: QueueName;
  maxConcurrency: number;
  maxSteps: number;
  maxSandboxMinutes: number;
};

const allowedQueues: ReadonlySet<string> = new Set(["compileQ", "sbxQ", "controlQ", "intentQ"]);
const lanePriorityDefaults: Readonly<Record<RunLane, number>> = {
  interactive: 1,
  batch: 1000
};
const defaultRecipeName = "compile-default";

export class QueuePolicyError extends Error {
  public readonly code = "queue_policy_violation";

  public constructor(message: string) {
    super(message);
    this.name = "QueuePolicyError";
  }
}

export type ResolvedQueuePolicy = {
  queueName: QueueName;
  priority?: number;
  deduplicationID?: string;
  timeoutMS?: number;
  queuePartitionKey?: string;
  recipeName: string;
  recipeVersion: number;
};

export function resolveLanePriority(
  lane: RunLane | undefined,
  explicitPriority: number | undefined
): number {
  if (explicitPriority !== undefined) {
    return explicitPriority;
  }
  return lanePriorityDefaults[lane ?? "interactive"];
}

export function assertDedupeOrPriorityEdge(options: {
  deduplicationID?: string;
  priority?: number;
}): void {
  if (!options.deduplicationID && options.priority === undefined) {
    throw new QueuePolicyError("dedupe_or_priority_required");
  }
}

function assertAllowedQueue(queueName: string): asserts queueName is QueueName {
  if (!allowedQueues.has(queueName)) {
    throw new QueuePolicyError(`unsupported queueName: ${queueName}`);
  }
}

function asPositiveInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new QueuePolicyError(`invalid recipe limit ${label}`);
  }
  return parsed;
}

async function resolveRecipePolicySource(
  pool: Pool,
  req: RunRequest,
  recipeRef?: RecipeRef
): Promise<RecipePolicySource> {
  if (recipeRef) {
    if (req.recipeName !== undefined && req.recipeName !== recipeRef.id) {
      throw new QueuePolicyError(`recipeName override mismatch for ${recipeRef.id}@${recipeRef.v}`);
    }
    if (req.recipeVersion !== undefined) {
      throw new QueuePolicyError("recipeVersion override is not allowed for pinned recipeRef");
    }
    const pinned = await findVersion(pool, recipeRef);
    if (!pinned) {
      throw new QueuePolicyError(`recipe not found: ${recipeRef.id}@${recipeRef.v}`);
    }
    assertAllowedQueue(pinned.json.queue);
    return {
      name: recipeRef.id,
      version: asPositiveInteger(Number.parseInt(recipeRef.v, 10) || 1, "version"),
      queueName: pinned.json.queue,
      maxConcurrency: asPositiveInteger(pinned.json.limits.maxFanout, "maxFanout"),
      maxSteps: asPositiveInteger(pinned.json.limits.maxSteps, "maxSteps"),
      maxSandboxMinutes: asPositiveInteger(pinned.json.limits.maxSbxMin, "maxSbxMin")
    };
  }

  const recipeName = req.recipeName ?? defaultRecipeName;
  const recipe = await findRecipeByName(pool, recipeName, req.recipeVersion);
  if (!recipe) {
    throw new QueuePolicyError(`recipe not found: ${recipeName}`);
  }
  assertAllowedQueue(recipe.queue_name);
  return {
    name: recipe.name,
    version: recipe.version,
    queueName: recipe.queue_name,
    maxConcurrency: recipe.max_concurrency,
    maxSteps: recipe.max_steps,
    maxSandboxMinutes: recipe.max_sandbox_minutes
  };
}

export async function resolveQueuePolicy(
  pool: Pool,
  req: RunRequest,
  isParentIntent = false,
  recipeRef?: RecipeRef
): Promise<ResolvedQueuePolicy> {
  const recipe = await resolveRecipePolicySource(pool, req, recipeRef);

  const queueName = req.queueName ?? recipe.queueName;
  assertAllowedQueue(queueName);

  if (isParentIntent && queueName !== "intentQ") {
    throw new QueuePolicyError(`parent intent workflow must use intentQ (got ${queueName})`);
  }

  const workload = req.workload;
  try {
    assertIngressBudget(req);
  } catch (error: unknown) {
    if (error instanceof BudgetGuardError) {
      throw new QueuePolicyError(error.message);
    }
    throw error;
  }
  if (workload) {
    if (workload.concurrency > recipe.maxConcurrency) {
      throw new QueuePolicyError(
        `recipe cap exceeded: concurrency ${workload.concurrency} > ${recipe.maxConcurrency}`
      );
    }
    if (workload.steps > recipe.maxSteps) {
      throw new QueuePolicyError(
        `recipe cap exceeded: steps ${workload.steps} > ${recipe.maxSteps}`
      );
    }
    if (workload.sandboxMinutes > recipe.maxSandboxMinutes) {
      throw new QueuePolicyError(
        `recipe cap exceeded: sandboxMinutes ${workload.sandboxMinutes} > ${recipe.maxSandboxMinutes}`
      );
    }
  }

  // Derive deduplicationID from taskKey if absent (C3.T3)
  const deduplicationID = req.deduplicationID ?? req.taskKey;

  // C7.T3: Reject blank/invalid tenantId|taskKey.
  if (req.tenantId !== undefined && req.tenantId.trim() === "") {
    throw new QueuePolicyError(`tenantId cannot be blank`);
  }
  if (req.taskKey !== undefined && req.taskKey.trim() === "") {
    throw new QueuePolicyError(`taskKey cannot be blank`);
  }

  // C7.T3: Remove implicit 'default-partition' fallback; reject if missing for sbxQ.
  // G07: If SBX partitioning is enabled, require partition key at start for parent intents too.
  const queuePartitionKey = req.queuePartitionKey;
  const needsPartitionKey =
    isPartitionedQueue(queueName) || (isParentIntent && isPartitionedQueue("intentQ"));

  if (needsPartitionKey) {
    if (!queuePartitionKey || queuePartitionKey.trim() === "") {
      throw new QueuePolicyError(
        `queuePartitionKey is required for partitioned operations (queue: ${queueName}, isParent: ${isParentIntent})`
      );
    }
  }

  const cfg = getConfig();
  const priorityEnabled = isPriorityEnabledQueue(queueName, cfg);
  if (!priorityEnabled && req.priority !== undefined) {
    throw new QueuePolicyError(`priority disabled for queue: ${queueName}`);
  }
  const priority = priorityEnabled ? resolveLanePriority(req.lane, req.priority) : undefined;
  assertDedupeOrPriorityEdge({ deduplicationID, priority });

  return {
    queueName,
    priority,
    deduplicationID,
    timeoutMS: req.timeoutMS,
    queuePartitionKey,
    recipeName: recipe.name,
    recipeVersion: recipe.version
  };
}
