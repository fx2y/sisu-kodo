import type { Pool } from "pg";
import type { RunRequest } from "../contracts/run-request.schema";
import { findRecipeByName } from "../db/recipeRepo";
import { getConfig } from "../config";
import type { IntentQueueName } from "./intent-enqueue";
import { isPartitionedQueue, isPriorityEnabledQueue } from "./dbos/queues";

export type QueueName = IntentQueueName;
type RunLane = NonNullable<RunRequest["lane"]>;

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
  const queuePartitionKey = req.queuePartitionKey;
  const needsPartitionKey = isPartitionedQueue(queueName) || (isParentIntent && isPartitionedQueue("intentQ"));

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
