import type { Pool } from "pg";
import type { RunRequest } from "../contracts/run-request.schema";
import { findRecipeByName } from "../db/recipeRepo";
import { getConfig } from "../config";

export type QueueName = "compileQ" | "sbxQ" | "controlQ" | "intentQ";

const allowedQueues: ReadonlySet<string> = new Set(["compileQ", "sbxQ", "controlQ", "intentQ"]);
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

function assertAllowedQueue(queueName: string): asserts queueName is QueueName {
  if (!allowedQueues.has(queueName)) {
    throw new QueuePolicyError(`unsupported queueName: ${queueName}`);
  }
}

export async function resolveQueuePolicy(
  pool: Pool,
  req: RunRequest,
  isParentIntent = false
): Promise<ResolvedQueuePolicy> {
  const recipeName = req.recipeName ?? defaultRecipeName;
  const recipe = await findRecipeByName(pool, recipeName, req.recipeVersion);
  if (!recipe) {
    throw new QueuePolicyError(`recipe not found: ${recipeName}`);
  }

  const queueName = req.queueName ?? recipe.queue_name;
  assertAllowedQueue(queueName);

  if (isParentIntent && queueName !== "intentQ") {
    throw new QueuePolicyError(`parent intent workflow must use intentQ (got ${queueName})`);
  }

  const workload = req.workload;
  if (workload) {
    if (workload.concurrency > recipe.max_concurrency) {
      throw new QueuePolicyError(
        `recipe cap exceeded: concurrency ${workload.concurrency} > ${recipe.max_concurrency}`
      );
    }
    if (workload.steps > recipe.max_steps) {
      throw new QueuePolicyError(
        `recipe cap exceeded: steps ${workload.steps} > ${recipe.max_steps}`
      );
    }
    if (workload.sandboxMinutes > recipe.max_sandbox_minutes) {
      throw new QueuePolicyError(
        `recipe cap exceeded: sandboxMinutes ${workload.sandboxMinutes} > ${recipe.max_sandbox_minutes}`
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
  const cfg = getConfig();
  const queuePartitionKey = req.queuePartitionKey;

  const needsPartitionKey = queueName === "sbxQ" || (isParentIntent && cfg.sbxQueue.partition);

  if (needsPartitionKey) {
    if (!queuePartitionKey || queuePartitionKey.trim() === "") {
      throw new QueuePolicyError(
        `queuePartitionKey is required for partitioned operations (queue: ${queueName}, isParent: ${isParentIntent})`
      );
    }
  }

  return {
    queueName,
    priority: req.priority,
    deduplicationID,
    timeoutMS: req.timeoutMS,
    queuePartitionKey,
    recipeName: recipe.name,
    recipeVersion: recipe.version
  };
}
