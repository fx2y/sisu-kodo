import { Pool } from "pg";

import { getConfig } from "../src/config";
import { nowIso, nowMs, waitMs } from "../src/lib/time";

const DEFAULT_POLL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_START_CONCURRENCY = 32;
const DEFAULT_REPLY_CONCURRENCY = 24;
const ACTIVE_DBOS_STATUSES = ["ENQUEUED", "PENDING", "RUNNING", "WAITING"] as const;
const TERMINAL_ERROR_RUN_STATUSES = new Set(["failed", "retries_exceeded", "canceled"]);

export type HitlSoakDeps = {
  baseUrl: string;
  appPool: Pool;
  sysPool: Pool;
};

export type HitlTarget = {
  workflowId: string;
  runId: string;
  gateKey: string;
  topic: string;
};

export type LoadProbeOptions = {
  targetWaits: number;
  pollMs?: number;
  timeoutMs?: number;
  startConcurrency?: number;
  queuePartitionKey?: string;
  dedupePrefix?: string;
};

export type LoadProbeReport = {
  kind: "hitl-load-1k";
  generatedAt: string;
  baseUrl: string;
  targetWaits: number;
  polling: {
    iterations: number;
    elapsedMs: number;
    cadenceMs: number;
  };
  waiting: {
    readyCount: number;
    pendingCount: number;
    enqueuedCount: number;
    erroredCount: number;
    gateCount: number;
  };
  pressure: {
    maxWaitingLocks: number;
    maxActiveWorkflowRows: number;
    lockTotalsAtReady: {
      waiting: number;
      total: number;
    };
    workflowStatusCountsAtReady: Record<string, number>;
    queueStatusCountsAtReady: Record<string, number>;
  };
  targets: HitlTarget[];
  dedupePrefix: string;
};

export type BurstProbeOptions = {
  pollMs?: number;
  timeoutMs?: number;
  replyConcurrency?: number;
  duplicateRepliesPerGate?: number;
  payload?: Record<string, unknown>;
  dedupePrefix?: string;
};

export type BurstProbeReport = {
  kind: "hitl-burst-reply";
  generatedAt: string;
  targetWaits: number;
  duplicateRepliesPerGate: number;
  polling: {
    iterations: number;
    elapsedMs: number;
    cadenceMs: number;
  };
  final: {
    succeeded: number;
    active: number;
    errors: number;
  };
  interactions: {
    totalRows: number;
    distinctDedupeKeys: number;
    expectedDistinct: number;
  };
  decisions: {
    duplicateDecisionKeys: number;
  };
  timeline: {
    duplicateStepAttempts: number;
    nonMonotonicStartedAtRows: number;
  };
  workflowStatusCounts: Record<string, number>;
  dedupePrefix: string;
};

export type SqlEvidencePack = {
  generatedAt: string;
  workflowCount: number;
  runCount: number;
  appRuns: {
    statusCounts: Record<string, number>;
    sample: Array<{
      id: string;
      workflow_id: string;
      status: string;
      next_action: string | null;
      last_step: string | null;
      retry_count: number;
    }>;
  };
  runSteps: {
    byStep: Array<{ step_id: string; c: number }>;
    duplicateAttempts: number;
  };
  artifacts: {
    byKind: Array<{ kind: string; c: number }>;
    duplicateRows: number;
  };
  humanInteractions: {
    total: number;
    byOrigin: Array<{ origin: string; c: number }>;
    duplicateRows: number;
    dedupePrefixRows: number;
  };
  workflowStatus: {
    byStatus: Record<string, number>;
    byQueueStatus: Array<{ queue_name: string; status: string; c: number }>;
  };
};

type StartRunHeader = {
  workflowID: string;
};

type RunGateRow = {
  workflow_id: string;
  run_id: string;
  status: string;
  next_action: string | null;
  gate_key: string | null;
  topic: string | null;
};

function assertPositiveInt(v: number, label: string): void {
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error(`${label} must be a positive integer; got ${v}`);
  }
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as Record<string, unknown>;
    return JSON.stringify(json);
  } catch {
    return await res.text();
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed (${res.status}): ${await parseErrorBody(res)}`);
  }
  return (await res.json()) as T;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const capped = Math.max(1, Math.min(limit, items.length));
  const out = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: capped }, () => runWorker()));
  return out;
}

async function createIntent(baseUrl: string, i: number): Promise<string> {
  const data = await postJson<{ intentId: string }>(`${baseUrl}/api/intents`, {
    goal: `C7 soak ${i}`,
    inputs: {},
    constraints: {}
  });
  if (!data.intentId) throw new Error(`intentId missing for index=${i}`);
  return data.intentId;
}

async function startRun(
  baseUrl: string,
  intentId: string,
  queuePartitionKey: string
): Promise<StartRunHeader> {
  const data = await postJson<StartRunHeader>(`${baseUrl}/api/runs`, {
    intentId,
    queueName: "intentQ",
    recipeName: "compile-default",
    queuePartitionKey,
    workload: {
      concurrency: 1,
      steps: 1,
      sandboxMinutes: 1
    }
  });
  if (!data.workflowID) throw new Error(`workflowID missing for intent ${intentId}`);
  return data;
}

async function fetchRunGateRows(pool: Pool, workflowIds: string[]): Promise<RunGateRow[]> {
  const res = await pool.query<RunGateRow>(
    `SELECT r.workflow_id,
            r.id AS run_id,
            r.status,
            r.next_action,
            g.gate_key,
            g.topic
       FROM app.runs r
  LEFT JOIN LATERAL (
           SELECT hg.gate_key, hg.topic
             FROM app.human_gates hg
            WHERE hg.run_id = r.id
            ORDER BY hg.created_at DESC
            LIMIT 1
       ) g ON TRUE
      WHERE r.workflow_id = ANY($1::text[])
      ORDER BY r.workflow_id`,
    [workflowIds]
  );
  return res.rows;
}

async function countWaitingLocks(pool: Pool): Promise<number> {
  const res = await pool.query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM pg_locks WHERE granted = false"
  );
  return Number(res.rows[0]?.c ?? "0");
}

async function countActiveWorkflowRows(sysPool: Pool, workflowIds: string[]): Promise<number> {
  const res = await sysPool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
       FROM dbos.workflow_status
      WHERE workflow_uuid = ANY($1::text[])
        AND status = ANY($2::text[])`,
    [workflowIds, [...ACTIVE_DBOS_STATUSES]]
  );
  return Number(res.rows[0]?.c ?? "0");
}

function summarizeRows(
  rows: RunGateRow[],
  workflowCount: number
): {
  readyCount: number;
  pendingCount: number;
  enqueuedCount: number;
  erroredCount: number;
  gateCount: number;
} {
  let readyCount = 0;
  let pendingCount = 0;
  let enqueuedCount = 0;
  let erroredCount = 0;
  let gateCount = 0;

  for (const row of rows) {
    if (row.gate_key) gateCount += 1;
    if (row.status === "waiting_input" && row.next_action === "APPROVE_PLAN" && row.gate_key) {
      readyCount += 1;
    } else if (row.status === "running" || row.status === "waiting_input") {
      pendingCount += 1;
    } else if (row.status === "queued") {
      enqueuedCount += 1;
    } else if (TERMINAL_ERROR_RUN_STATUSES.has(row.status)) {
      erroredCount += 1;
    }
  }

  if (rows.length !== workflowCount) {
    throw new Error(`Expected ${workflowCount} rows in app.runs, found ${rows.length}`);
  }

  return {
    readyCount,
    pendingCount,
    enqueuedCount,
    erroredCount,
    gateCount
  };
}

async function fetchWorkflowStatusCounts(
  sysPool: Pool,
  workflowIds: string[]
): Promise<{ byStatus: Record<string, number>; byQueueStatus: Record<string, number> }> {
  const [statusRows, queueRows] = await Promise.all([
    sysPool.query<{ status: string; c: string }>(
      `SELECT status, COUNT(*)::text AS c
         FROM dbos.workflow_status
        WHERE workflow_uuid = ANY($1::text[])
        GROUP BY status`,
      [workflowIds]
    ),
    sysPool.query<{ queue_name: string | null; status: string; c: string }>(
      `SELECT COALESCE(queue_name, 'none') AS queue_name, status, COUNT(*)::text AS c
         FROM dbos.workflow_status
        WHERE workflow_uuid = ANY($1::text[])
        GROUP BY queue_name, status`,
      [workflowIds]
    )
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusRows.rows) {
    byStatus[row.status] = Number(row.c);
  }

  const byQueueStatus: Record<string, number> = {};
  for (const row of queueRows.rows) {
    byQueueStatus[`${row.queue_name}:${row.status}`] = Number(row.c);
  }

  return { byStatus, byQueueStatus };
}

export async function createHitlSoakDeps(baseUrl?: string): Promise<HitlSoakDeps> {
  const cfg = getConfig();
  return {
    baseUrl: baseUrl ?? `http://127.0.0.1:${process.env.PORT ?? "3001"}`,
    appPool: new Pool({ connectionString: cfg.appDatabaseUrl }),
    sysPool: new Pool({ connectionString: cfg.systemDatabaseUrl })
  };
}

export async function closeHitlSoakDeps(deps: HitlSoakDeps): Promise<void> {
  await Promise.all([deps.appPool.end(), deps.sysPool.end()]);
}

export async function runLoadProbe(
  deps: HitlSoakDeps,
  options: LoadProbeOptions
): Promise<LoadProbeReport> {
  assertPositiveInt(options.targetWaits, "targetWaits");

  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startConcurrency = options.startConcurrency ?? DEFAULT_START_CONCURRENCY;
  const queuePartitionKey = options.queuePartitionKey ?? "hitl-c7-soak";
  const dedupePrefix = options.dedupePrefix ?? `c7-load-${nowMs()}`;

  const indexes = Array.from({ length: options.targetWaits }, (_, i) => i);

  const workflowIds = await mapLimit(indexes, startConcurrency, async (idx) => {
    const intentId = await createIntent(deps.baseUrl, idx);
    const started = await startRun(deps.baseUrl, intentId, queuePartitionKey);
    return started.workflowID;
  });

  const startedAt = nowMs();
  let iterations = 0;
  let maxWaitingLocks = 0;
  let maxActiveWorkflowRows = 0;

  let finalRows: RunGateRow[] = [];

  while (nowMs() - startedAt <= timeoutMs) {
    iterations += 1;
    finalRows = await fetchRunGateRows(deps.appPool, workflowIds);
    const summary = summarizeRows(finalRows, workflowIds.length);

    if (summary.erroredCount > 0) {
      throw new Error(`Load probe detected ${summary.erroredCount} errored runs before gate-ready`);
    }

    maxWaitingLocks = Math.max(maxWaitingLocks, await countWaitingLocks(deps.appPool));
    maxActiveWorkflowRows = Math.max(
      maxActiveWorkflowRows,
      await countActiveWorkflowRows(deps.sysPool, workflowIds)
    );

    if (summary.readyCount === workflowIds.length) {
      break;
    }

    await waitMs(pollMs);
  }

  const elapsedMs = nowMs() - startedAt;
  const cadenceMs = iterations > 0 ? Math.round(elapsedMs / iterations) : elapsedMs;

  const readySummary = summarizeRows(finalRows, workflowIds.length);
  if (readySummary.readyCount !== workflowIds.length) {
    throw new Error(
      `Timed out waiting for gate-ready runs (${readySummary.readyCount}/${workflowIds.length}) after ${elapsedMs}ms`
    );
  }

  const lockTotals = await deps.appPool.query<{ waiting: string; total: string }>(
    "SELECT COUNT(*) FILTER (WHERE granted = false)::text AS waiting, COUNT(*)::text AS total FROM pg_locks"
  );

  const workflowCounts = await fetchWorkflowStatusCounts(deps.sysPool, workflowIds);

  const targets = finalRows
    .filter((row) => row.gate_key !== null && row.topic !== null)
    .map((row) => ({
      workflowId: row.workflow_id,
      runId: row.run_id,
      gateKey: row.gate_key as string,
      topic: row.topic as string
    }));

  if (targets.length !== workflowIds.length) {
    throw new Error(
      `Expected gate targets for all workflows; got ${targets.length}/${workflowIds.length}`
    );
  }

  return {
    kind: "hitl-load-1k",
    generatedAt: nowIso(),
    baseUrl: deps.baseUrl,
    targetWaits: options.targetWaits,
    polling: {
      iterations,
      elapsedMs,
      cadenceMs
    },
    waiting: readySummary,
    pressure: {
      maxWaitingLocks,
      maxActiveWorkflowRows,
      lockTotalsAtReady: {
        waiting: Number(lockTotals.rows[0]?.waiting ?? "0"),
        total: Number(lockTotals.rows[0]?.total ?? "0")
      },
      workflowStatusCountsAtReady: workflowCounts.byStatus,
      queueStatusCountsAtReady: workflowCounts.byQueueStatus
    },
    targets,
    dedupePrefix
  };
}

async function postReply(
  baseUrl: string,
  workflowId: string,
  gateKey: string,
  payload: Record<string, unknown>,
  dedupeKey: string
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/runs/${workflowId}/gates/${gateKey}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload, dedupeKey })
  });

  if (!res.ok) {
    throw new Error(
      `POST /api/runs/${workflowId}/gates/${gateKey}/reply failed (${res.status}): ${await parseErrorBody(res)}`
    );
  }
}

async function summarizeFinalRunStates(
  appPool: Pool,
  workflowIds: string[]
): Promise<{ succeeded: number; active: number; errors: number }> {
  const res = await appPool.query<{ workflow_id: string; status: string }>(
    "SELECT workflow_id, status FROM app.runs WHERE workflow_id = ANY($1::text[])",
    [workflowIds]
  );

  let succeeded = 0;
  let active = 0;
  let errors = 0;

  for (const row of res.rows) {
    if (row.status === "succeeded") succeeded += 1;
    else if (TERMINAL_ERROR_RUN_STATUSES.has(row.status)) errors += 1;
    else active += 1;
  }

  return { succeeded, active, errors };
}

export async function runBurstReplyProbe(
  deps: HitlSoakDeps,
  targets: HitlTarget[],
  options: BurstProbeOptions = {}
): Promise<BurstProbeReport> {
  if (targets.length === 0) {
    throw new Error("Burst probe requires at least one target");
  }

  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const replyConcurrency = options.replyConcurrency ?? DEFAULT_REPLY_CONCURRENCY;
  const duplicateRepliesPerGate = options.duplicateRepliesPerGate ?? 2;
  const payload = options.payload ?? { choice: "yes", rationale: "c7-burst" };
  const dedupePrefix = options.dedupePrefix ?? `c7-burst-${nowMs()}`;

  await mapLimit(targets, replyConcurrency, async (target, idx) => {
    const dedupeKey = `${dedupePrefix}:${idx}`;
    const copies = duplicateRepliesPerGate + 1;
    const attempts = Array.from({ length: copies }, () =>
      postReply(deps.baseUrl, target.workflowId, target.gateKey, payload, dedupeKey)
    );
    await Promise.all(attempts);
  });

  const workflowIds = targets.map((target) => target.workflowId);
  const runIds = targets.map((target) => target.runId);

  const startedAt = nowMs();
  let iterations = 0;
  let final = await summarizeFinalRunStates(deps.appPool, workflowIds);

  while (nowMs() - startedAt <= timeoutMs) {
    iterations += 1;
    final = await summarizeFinalRunStates(deps.appPool, workflowIds);

    if (final.errors > 0) {
      throw new Error(`Burst probe detected ${final.errors} errored runs`);
    }

    if (final.succeeded === targets.length && final.active === 0) {
      break;
    }

    await waitMs(pollMs);
  }

  if (final.succeeded !== targets.length || final.active !== 0) {
    throw new Error(
      `Timed out waiting for burst drain: succeeded=${final.succeeded}/${targets.length}, active=${final.active}`
    );
  }

  const [interactionRows, decisionDupeRows, stepDupeRows, nonMonotonicRows, workflowCounts] =
    await Promise.all([
      deps.appPool.query<{ total_rows: string; distinct_dedupe_keys: string }>(
        `SELECT COUNT(*)::text AS total_rows,
                COUNT(DISTINCT dedupe_key)::text AS distinct_dedupe_keys
           FROM app.human_interactions
          WHERE workflow_id = ANY($1::text[])
            AND dedupe_key LIKE $2`,
        [workflowIds, `${dedupePrefix}:%`]
      ),
      deps.sysPool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM (
             SELECT workflow_uuid, key
               FROM dbos.workflow_events
              WHERE workflow_uuid = ANY($1::text[])
                AND key LIKE 'decision:%'
              GROUP BY workflow_uuid, key
             HAVING COUNT(*) > 1
           ) dup`,
        [workflowIds]
      ),
      deps.appPool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM (
             SELECT run_id, step_id, attempt
               FROM app.run_steps
              WHERE run_id = ANY($1::text[])
              GROUP BY run_id, step_id, attempt
             HAVING COUNT(*) > 1
           ) dup`,
        [runIds]
      ),
      deps.appPool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM (
             SELECT run_id,
                    started_at,
                    LAG(started_at) OVER (PARTITION BY run_id ORDER BY started_at, step_id) AS prev_started_at
               FROM app.run_steps
              WHERE run_id = ANY($1::text[])
           ) ordered
          WHERE prev_started_at IS NOT NULL
            AND started_at < prev_started_at`,
        [runIds]
      ),
      fetchWorkflowStatusCounts(deps.sysPool, workflowIds)
    ]);

  const elapsedMs = nowMs() - startedAt;
  const cadenceMs = iterations > 0 ? Math.round(elapsedMs / iterations) : elapsedMs;

  return {
    kind: "hitl-burst-reply",
    generatedAt: nowIso(),
    targetWaits: targets.length,
    duplicateRepliesPerGate,
    polling: {
      iterations,
      elapsedMs,
      cadenceMs
    },
    final,
    interactions: {
      totalRows: Number(interactionRows.rows[0]?.total_rows ?? "0"),
      distinctDedupeKeys: Number(interactionRows.rows[0]?.distinct_dedupe_keys ?? "0"),
      expectedDistinct: targets.length
    },
    decisions: {
      duplicateDecisionKeys: Number(decisionDupeRows.rows[0]?.c ?? "0")
    },
    timeline: {
      duplicateStepAttempts: Number(stepDupeRows.rows[0]?.c ?? "0"),
      nonMonotonicStartedAtRows: Number(nonMonotonicRows.rows[0]?.c ?? "0")
    },
    workflowStatusCounts: workflowCounts.byStatus,
    dedupePrefix
  };
}

export async function collectSqlEvidence(
  deps: HitlSoakDeps,
  targets: HitlTarget[],
  dedupePrefix: string,
  sampleLimit = 50
): Promise<SqlEvidencePack> {
  const workflowIds = targets.map((target) => target.workflowId);
  const runIds = targets.map((target) => target.runId);

  const [
    appRunsByStatus,
    appRunsSample,
    runStepsByStep,
    runStepsDupes,
    artifactsByKind,
    artifactsDupes,
    interactionsTotal,
    interactionsByOrigin,
    interactionsDupes,
    interactionsByPrefix,
    workflowStatus,
    workflowQueueStatus
  ] = await Promise.all([
    deps.appPool.query<{ status: string; c: string }>(
      "SELECT status, COUNT(*)::text AS c FROM app.runs WHERE workflow_id = ANY($1::text[]) GROUP BY status",
      [workflowIds]
    ),
    deps.appPool.query<{
      id: string;
      workflow_id: string;
      status: string;
      next_action: string | null;
      last_step: string | null;
      retry_count: number;
    }>(
      `SELECT id, workflow_id, status, next_action, last_step, retry_count
         FROM app.runs
        WHERE workflow_id = ANY($1::text[])
        ORDER BY created_at DESC
        LIMIT ${sampleLimit}`,
      [workflowIds]
    ),
    deps.appPool.query<{ step_id: string; c: string }>(
      "SELECT step_id, COUNT(*)::text AS c FROM app.run_steps WHERE run_id = ANY($1::text[]) GROUP BY step_id ORDER BY step_id",
      [runIds]
    ),
    deps.appPool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM (
           SELECT run_id, step_id, attempt
             FROM app.run_steps
            WHERE run_id = ANY($1::text[])
            GROUP BY run_id, step_id, attempt
           HAVING COUNT(*) > 1
         ) dup`,
      [runIds]
    ),
    deps.appPool.query<{ kind: string; c: string }>(
      "SELECT kind, COUNT(*)::text AS c FROM app.artifacts WHERE run_id = ANY($1::text[]) GROUP BY kind ORDER BY kind",
      [runIds]
    ),
    deps.appPool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM (
           SELECT run_id, step_id, task_key, attempt, idx
             FROM app.artifacts
            WHERE run_id = ANY($1::text[])
            GROUP BY run_id, step_id, task_key, attempt, idx
           HAVING COUNT(*) > 1
         ) dup`,
      [runIds]
    ),
    deps.appPool.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM app.human_interactions WHERE workflow_id = ANY($1::text[])",
      [workflowIds]
    ),
    deps.appPool.query<{ origin: string | null; c: string }>(
      `SELECT COALESCE(origin, 'human') AS origin, COUNT(*)::text AS c
         FROM app.human_interactions
        WHERE workflow_id = ANY($1::text[])
        GROUP BY origin
        ORDER BY origin`,
      [workflowIds]
    ),
    deps.appPool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM (
           SELECT workflow_id, gate_key, topic, dedupe_key
             FROM app.human_interactions
            WHERE workflow_id = ANY($1::text[])
            GROUP BY workflow_id, gate_key, topic, dedupe_key
           HAVING COUNT(*) > 1
         ) dup`,
      [workflowIds]
    ),
    deps.appPool.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM app.human_interactions WHERE workflow_id = ANY($1::text[]) AND dedupe_key LIKE $2",
      [workflowIds, `${dedupePrefix}:%`]
    ),
    deps.sysPool.query<{ status: string; c: string }>(
      "SELECT status, COUNT(*)::text AS c FROM dbos.workflow_status WHERE workflow_uuid = ANY($1::text[]) GROUP BY status",
      [workflowIds]
    ),
    deps.sysPool.query<{ queue_name: string | null; status: string; c: string }>(
      `SELECT COALESCE(queue_name, 'none') AS queue_name, status, COUNT(*)::text AS c
         FROM dbos.workflow_status
        WHERE workflow_uuid = ANY($1::text[])
        GROUP BY queue_name, status
        ORDER BY queue_name, status`,
      [workflowIds]
    )
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of appRunsByStatus.rows) {
    statusCounts[row.status] = Number(row.c);
  }

  const workflowStatusCounts: Record<string, number> = {};
  for (const row of workflowStatus.rows) {
    workflowStatusCounts[row.status] = Number(row.c);
  }

  return {
    generatedAt: nowIso(),
    workflowCount: workflowIds.length,
    runCount: runIds.length,
    appRuns: {
      statusCounts,
      sample: appRunsSample.rows
    },
    runSteps: {
      byStep: runStepsByStep.rows.map((row) => ({ step_id: row.step_id, c: Number(row.c) })),
      duplicateAttempts: Number(runStepsDupes.rows[0]?.c ?? "0")
    },
    artifacts: {
      byKind: artifactsByKind.rows.map((row) => ({ kind: row.kind, c: Number(row.c) })),
      duplicateRows: Number(artifactsDupes.rows[0]?.c ?? "0")
    },
    humanInteractions: {
      total: Number(interactionsTotal.rows[0]?.c ?? "0"),
      byOrigin: interactionsByOrigin.rows.map((row) => ({
        origin: row.origin ?? "human",
        c: Number(row.c)
      })),
      duplicateRows: Number(interactionsDupes.rows[0]?.c ?? "0"),
      dedupePrefixRows: Number(interactionsByPrefix.rows[0]?.c ?? "0")
    },
    workflowStatus: {
      byStatus: workflowStatusCounts,
      byQueueStatus: workflowQueueStatus.rows.map((row) => ({
        queue_name: row.queue_name ?? "none",
        status: row.status,
        c: Number(row.c)
      }))
    }
  };
}

export async function writeJsonReport(path: string, payload: unknown): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
