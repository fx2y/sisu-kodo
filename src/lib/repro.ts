import type { Pool } from "pg";
import { canonicalStringify } from "./hash";

export type ReproSnapshot = {
  meta: {
    runId: string;
    workflowId: string;
    appDb?: string;
    sysDb?: string;
  };
  run: Record<string, unknown>;
  intent: Record<string, unknown> | null;
  runSteps: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  evalResults: Array<Record<string, unknown>>;
  sbxRuns: Array<Record<string, unknown>>;
  opencodeCalls: Array<Record<string, unknown>>;
  humanGates: Array<Record<string, unknown>>;
  humanInteractions: Array<Record<string, unknown>>;
  dbos: {
    workflowScope: string[];
    parentStatuses: Array<Record<string, unknown>>;
    childStatuses: Array<Record<string, unknown>>;
    parentEvents: Array<Record<string, unknown>>;
    childEvents: Array<Record<string, unknown>>;
  };
};

function sortable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return canonicalStringify(value);
}

function sortRows(
  rows: Array<Record<string, unknown>>,
  keys: string[]
): Array<Record<string, unknown>> {
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const av = sortable(a[key]);
      const bv = sortable(b[key]);
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  });
}

async function loadJsonRows(
  pool: Pool,
  sql: string,
  params: unknown[] = []
): Promise<Array<Record<string, unknown>>> {
  const res = await pool.query<{ row: Record<string, unknown> }>(sql, params);
  return res.rows.map((r) => r.row);
}

async function tableExists(pool: Pool, schema: string, table: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass($1)::text IS NOT NULL AS exists",
    [`${schema}.${table}`]
  );
  return Boolean(res.rows[0]?.exists);
}

async function loadColumnNames(pool: Pool, schema: string, table: string): Promise<string[]> {
  const res = await pool.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [schema, table]
  );
  return res.rows.map((r) => r.column_name);
}

async function discoverDbosWorkflowScope(
  sysPool: Pool,
  workflowId: string,
  sbxRows: Array<Record<string, unknown>>,
  gateRows: Array<Record<string, unknown>>
): Promise<string[]> {
  const ids = new Set<string>([workflowId]);

  for (const row of sbxRows) {
    if (typeof row.task_key === "string" && row.task_key.length > 0) ids.add(row.task_key);
  }
  for (const row of gateRows) {
    if (typeof row.gate_key === "string" && row.gate_key.length > 0) {
      ids.add(`esc:${workflowId}:${row.gate_key}`);
    }
  }

  if (!(await tableExists(sysPool, "dbos", "workflow_status"))) {
    return [...ids];
  }

  const statusCols = new Set(await loadColumnNames(sysPool, "dbos", "workflow_status"));
  const parentCol = statusCols.has("parent_workflow_uuid")
    ? "parent_workflow_uuid"
    : statusCols.has("parent_workflow_id")
      ? "parent_workflow_id"
      : null;
  const childCol = statusCols.has("workflow_uuid")
    ? "workflow_uuid"
    : statusCols.has("workflow_id")
      ? "workflow_id"
      : null;

  if (!parentCol || !childCol) {
    return [...ids];
  }

  let frontier = [...ids];
  while (frontier.length > 0) {
    const res = await sysPool.query<{ child: string }>(
      `SELECT DISTINCT ${childCol}::text AS child
         FROM dbos.workflow_status
        WHERE ${parentCol} = ANY($1::text[])`,
      [frontier]
    );
    frontier = [];
    for (const row of res.rows) {
      if (row.child && !ids.has(row.child)) {
        ids.add(row.child);
        frontier.push(row.child);
      }
    }
  }

  return [...ids];
}

export async function generateReproSnapshot(
  appPool: Pool,
  sysPool: Pool,
  runIdOrWorkflowId: string,
  opts: { appDbName?: string; sysDbName?: string } = {}
): Promise<ReproSnapshot> {
  const runRows = await loadJsonRows(
    appPool,
    `SELECT to_jsonb(r) AS row
       FROM app.runs r
      WHERE r.id = $1 OR r.workflow_id = $1`,
    [runIdOrWorkflowId]
  );
  if (runRows.length === 0) {
    throw new Error(`run not found: ${runIdOrWorkflowId}`);
  }

  const runRow = sortRows(runRows, ["updated_at", "created_at", "id"])[runRows.length - 1];
  const runId = String(runRow.id ?? "");
  const workflowId = String(runRow.workflow_id ?? "");
  const intentId = String(runRow.intent_id ?? "");

  const [
    intentRows,
    stepRows,
    artifactRows,
    evalRows,
    sbxRows,
    ocRows,
    gateRows,
    interactionRows
  ] = await Promise.all([
    loadJsonRows(appPool, "SELECT to_jsonb(i) AS row FROM app.intents i WHERE i.id = $1", [
      intentId
    ]),
    loadJsonRows(appPool, "SELECT to_jsonb(s) AS row FROM app.run_steps s WHERE s.run_id = $1", [
      runId
    ]),
    loadJsonRows(appPool, "SELECT to_jsonb(a) AS row FROM app.artifacts a WHERE a.run_id = $1", [
      runId
    ]),
    loadJsonRows(
      appPool,
      "SELECT to_jsonb(e) AS row FROM app.eval_results e WHERE e.run_id = $1",
      [runId]
    ),
    loadJsonRows(appPool, "SELECT to_jsonb(s) AS row FROM app.sbx_runs s WHERE s.run_id = $1", [
      runId
    ]),
    loadJsonRows(
      appPool,
      "SELECT to_jsonb(o) AS row FROM app.opencode_calls o WHERE o.run_id = $1",
      [runId]
    ),
    loadJsonRows(
      appPool,
      "SELECT to_jsonb(g) AS row FROM app.human_gates g WHERE g.run_id = $1",
      [runId]
    ),
    loadJsonRows(
      appPool,
      "SELECT to_jsonb(h) AS row FROM app.human_interactions h WHERE h.workflow_id = $1",
      [workflowId]
    )
  ]);

  const workflowScope = await discoverDbosWorkflowScope(sysPool, workflowId, sbxRows, gateRows);
  const workflowScopeNoParent = workflowScope.filter((id) => id !== workflowId);

  const hasStatus = await tableExists(sysPool, "dbos", "workflow_status");
  const hasEvents = await tableExists(sysPool, "dbos", "workflow_events");
  const statusCols = hasStatus
    ? new Set(await loadColumnNames(sysPool, "dbos", "workflow_status"))
    : new Set<string>();
  const eventsCols = hasEvents
    ? new Set(await loadColumnNames(sysPool, "dbos", "workflow_events"))
    : new Set<string>();
  const statusWorkflowCol = statusCols.has("workflow_uuid")
    ? "workflow_uuid"
    : statusCols.has("workflow_id")
      ? "workflow_id"
      : null;
  const eventsWorkflowCol = eventsCols.has("workflow_uuid")
    ? "workflow_uuid"
    : eventsCols.has("workflow_id")
      ? "workflow_id"
      : null;

  const parentStatuses =
    hasStatus && statusWorkflowCol
      ? await loadJsonRows(
          sysPool,
          `SELECT to_jsonb(s) AS row FROM dbos.workflow_status s WHERE s.${statusWorkflowCol} = $1`,
          [workflowId]
        )
      : [];

  const childStatuses =
    hasStatus && statusWorkflowCol && workflowScopeNoParent.length > 0
      ? await loadJsonRows(
          sysPool,
          `SELECT to_jsonb(s) AS row FROM dbos.workflow_status s WHERE s.${statusWorkflowCol} = ANY($1::text[])`,
          [workflowScopeNoParent]
        )
      : [];

  const parentEvents =
    hasEvents && eventsWorkflowCol
      ? await loadJsonRows(
          sysPool,
          `SELECT to_jsonb(e) AS row FROM dbos.workflow_events e WHERE e.${eventsWorkflowCol} = $1`,
          [workflowId]
        )
      : [];

  const childEvents =
    hasEvents && eventsWorkflowCol && workflowScopeNoParent.length > 0
      ? await loadJsonRows(
          sysPool,
          `SELECT to_jsonb(e) AS row FROM dbos.workflow_events e WHERE e.${eventsWorkflowCol} = ANY($1::text[])`,
          [workflowScopeNoParent]
        )
      : [];

  return {
    meta: {
      runId,
      workflowId,
      appDb: opts.appDbName,
      sysDb: opts.sysDbName
    },
    run: runRow,
    intent: intentRows[0] ?? null,
    runSteps: sortRows(stepRows, ["step_id", "attempt", "started_at"]),
    artifacts: sortRows(artifactRows, ["step_id", "task_key", "attempt", "idx"]),
    evalResults: sortRows(evalRows, ["check_id", "created_at"]),
    sbxRuns: sortRows(sbxRows, ["step_id", "task_key", "attempt"]),
    opencodeCalls: sortRows(ocRows, ["created_at", "id"]),
    humanGates: sortRows(gateRows, ["gate_key", "created_at"]),
    humanInteractions: sortRows(interactionRows, [
      "gate_key",
      "topic",
      "dedupe_key",
      "created_at"
    ]),
    dbos: {
      workflowScope: workflowScope.sort(),
      parentStatuses: sortRows(parentStatuses, ["workflow_uuid", "queue_name", "status"]),
      childStatuses: sortRows(childStatuses, ["workflow_uuid", "queue_name", "status"]),
      parentEvents: sortRows(parentEvents, ["workflow_uuid", "key"]),
      childEvents: sortRows(childEvents, ["workflow_uuid", "key"])
    }
  };
}
