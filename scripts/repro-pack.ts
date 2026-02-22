import { writeFile } from "node:fs/promises";
import type { Pool } from "pg";
import { createPool } from "../src/db/pool";
import { getConfig } from "../src/config";
import { canonicalStringify } from "../src/lib/hash";

type CliArgs = {
  run: string;
  out?: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function parseArgs(argv: string[]): CliArgs {
  let run: string | undefined;
  let out: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--run") {
      run = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--out") {
      out = argv[i + 1];
      i += 1;
      continue;
    }
    fail(`unknown arg: ${arg}`);
  }

  if (!run || run.length === 0) {
    fail("usage: pnpm exec tsx scripts/repro-pack.ts --run <runId|workflowId> [--out <file>]");
  }

  return { run, out };
}

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = getConfig();
  const appPool = createPool(cfg.appDbName);
  const sysPool = createPool(cfg.sysDbName);

  try {
    const runRows = await loadJsonRows(
      appPool,
      `SELECT to_jsonb(r) AS row
         FROM app.runs r
        WHERE r.id = $1 OR r.workflow_id = $1`,
      [args.run]
    );
    if (runRows.length === 0) {
      fail(`run not found: ${args.run}`);
    }

    const runRow = sortRows(runRows, ["updated_at", "created_at", "id"])[runRows.length - 1];
    const runId = String(runRow.id ?? "");
    const workflowId = String(runRow.workflow_id ?? "");
    const intentId = String(runRow.intent_id ?? "");

    const [intentRows, stepRows, artifactRows, sbxRows, ocRows, gateRows, interactionRows] =
      await Promise.all([
        loadJsonRows(appPool, "SELECT to_jsonb(i) AS row FROM app.intents i WHERE i.id = $1", [
          intentId
        ]),
        loadJsonRows(
          appPool,
          "SELECT to_jsonb(s) AS row FROM app.run_steps s WHERE s.run_id = $1",
          [runId]
        ),
        loadJsonRows(
          appPool,
          "SELECT to_jsonb(a) AS row FROM app.artifacts a WHERE a.run_id = $1",
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

    const childTaskKeys = sortRows(sbxRows, ["task_key"]).map((row) => row.task_key);
    const childKeys = childTaskKeys.filter(
      (v): v is string => typeof v === "string" && v.length > 0
    );

    const parentStatuses = await loadJsonRows(
      sysPool,
      "SELECT to_jsonb(s) AS row FROM dbos.workflow_status s WHERE s.workflow_uuid = $1",
      [workflowId]
    );

    const childStatuses =
      childKeys.length === 0
        ? []
        : await loadJsonRows(
            sysPool,
            "SELECT to_jsonb(s) AS row FROM dbos.workflow_status s WHERE s.workflow_uuid = ANY($1::text[])",
            [childKeys]
          );

    const snapshot = {
      meta: {
        runId,
        workflowId,
        appDb: cfg.appDbName,
        sysDb: cfg.sysDbName
      },
      run: runRow,
      intent: intentRows[0] ?? null,
      runSteps: sortRows(stepRows, ["step_id", "attempt", "started_at"]),
      artifacts: sortRows(artifactRows, ["step_id", "task_key", "attempt", "idx"]),
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
        parentStatuses: sortRows(parentStatuses, ["workflow_uuid", "queue_name", "status"]),
        childStatuses: sortRows(childStatuses, ["workflow_uuid", "queue_name", "status"])
      }
    };

    const encoded = `${canonicalStringify(snapshot)}\n`;
    if (args.out) {
      await writeFile(args.out, encoded, "utf8");
      process.stdout.write(`${args.out}\n`);
      return;
    }
    process.stdout.write(encoded);
  } finally {
    await Promise.allSettled([appPool.end(), sysPool.end()]);
  }
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[repro-pack] ${msg}\n`);
  process.exit(1);
});
