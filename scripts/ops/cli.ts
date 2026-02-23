import { stdin as input } from "node:process";
import { getConfig } from "../../src/config";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSClientWorkflowEngine } from "../../src/api-shim/dbos-client";
import {
  cancelWorkflow,
  forkWorkflow,
  listWorkflows,
  resumeWorkflow,
  type OpsActionAck,
  type OpsForkAck
} from "../../src/server/ops-api";
import type { WorkflowOpsStatus, WorkflowService } from "../../src/workflow/port";

type ListFormat = "ids" | "json";
type Command = "list" | "cancel" | "resume" | "fork" | "retry-from-step";

type ParsedArgs = {
  command: Command;
  statuses: WorkflowOpsStatus[];
  name?: string;
  limit: number;
  format: ListFormat;
  actor?: string;
  reason?: string;
  stepN?: number;
  appVersion?: string;
  ids: string[];
  useStdin: boolean;
};

const WORKFLOW_STATUSES: ReadonlySet<WorkflowOpsStatus> = new Set([
  "PENDING",
  "SUCCESS",
  "ERROR",
  "MAX_RECOVERY_ATTEMPTS_EXCEEDED",
  "CANCELLED",
  "ENQUEUED"
]);

function fail(message: string): never {
  throw new Error(message);
}

function parseIntStrict(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    fail(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseStatus(value: string): WorkflowOpsStatus {
  if (!WORKFLOW_STATUSES.has(value as WorkflowOpsStatus)) {
    fail(`invalid --status value: ${value}`);
  }
  return value as WorkflowOpsStatus;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function uniqueStatuses(values: WorkflowOpsStatus[]): WorkflowOpsStatus[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function parseInlineIds(value: string): string[] {
  return uniqueSorted(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] as Command | undefined;
  if (!command) {
    fail(usage());
  }
  if (!["list", "cancel", "resume", "fork", "retry-from-step"].includes(command)) {
    fail(`unknown command: ${command}\n${usage()}`);
  }

  let statuses: WorkflowOpsStatus[] = [];
  let name: string | undefined;
  let limit = 20;
  let format: ListFormat = "ids";
  let actor: string | undefined;
  let reason: string | undefined;
  let stepN: number | undefined;
  let appVersion: string | undefined;
  let ids: string[] = [];
  let useStdin = false;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--status") {
      if (!next) fail("--status requires a value");
      statuses.push(parseStatus(next));
      i += 1;
      continue;
    }
    if (arg === "--name") {
      if (!next || next.trim().length === 0) fail("--name requires a non-empty value");
      name = next.trim();
      i += 1;
      continue;
    }
    if (arg === "--limit") {
      if (!next) fail("--limit requires a value");
      limit = parseIntStrict(next, "--limit");
      i += 1;
      continue;
    }
    if (arg === "--format") {
      if (!next) fail("--format requires a value");
      if (next !== "ids" && next !== "json") fail(`invalid --format value: ${next}`);
      format = next;
      i += 1;
      continue;
    }
    if (arg === "--actor") {
      if (!next || next.trim().length === 0) fail("--actor requires a non-empty value");
      actor = next.trim();
      i += 1;
      continue;
    }
    if (arg === "--reason") {
      if (!next || next.trim().length === 0) fail("--reason requires a non-empty value");
      reason = next.trim();
      i += 1;
      continue;
    }
    if (arg === "--step") {
      if (!next) fail("--step requires a value");
      stepN = parseIntStrict(next, "--step");
      i += 1;
      continue;
    }
    if (arg === "--app-version") {
      if (!next || next.trim().length === 0) fail("--app-version requires a non-empty value");
      appVersion = next.trim();
      i += 1;
      continue;
    }
    if (arg === "--ids") {
      if (!next) fail("--ids requires a comma-separated value");
      ids = ids.concat(parseInlineIds(next));
      i += 1;
      continue;
    }
    if (arg === "--stdin") {
      useStdin = true;
      continue;
    }
    fail(`unknown arg: ${arg}\n${usage()}`);
  }

  statuses = uniqueStatuses(statuses);
  ids = uniqueSorted(ids);

  if (command !== "list") {
    if (!actor) fail(`--actor is required for ${command}`);
    if (!reason) fail(`--reason is required for ${command}`);
  }
  if (command === "fork" || command === "retry-from-step") {
    if (stepN === undefined) fail(`--step is required for ${command}`);
  }

  return {
    command,
    statuses,
    name,
    limit,
    format,
    actor,
    reason,
    stepN,
    appVersion,
    ids,
    useStdin
  };
}

function usage(): string {
  return [
    "usage:",
    "  pnpm exec tsx scripts/ops/cli.ts list [--status <STATUS>]... [--name <workflowName>] [--limit <N>] [--format ids|json]",
    "  pnpm exec tsx scripts/ops/cli.ts cancel --actor <actor> --reason <reason> [--ids <wid1,wid2>] [--stdin]",
    "  pnpm exec tsx scripts/ops/cli.ts resume --actor <actor> --reason <reason> [--ids <wid1,wid2>] [--stdin]",
    "  pnpm exec tsx scripts/ops/cli.ts fork --step <N> [--app-version <ver>] --actor <actor> --reason <reason> [--ids <wid1,wid2>] [--stdin]",
    "  pnpm exec tsx scripts/ops/cli.ts retry-from-step --step <N> [--app-version <ver>] --actor <actor> --reason <reason> [--ids <wid1,wid2>] [--stdin]"
  ].join("\n");
}

async function readStdinIds(): Promise<string[]> {
  const isTTY = Boolean((input as NodeJS.ReadStream).isTTY);
  if (isTTY) {
    return [];
  }
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return uniqueSorted(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  );
}

type ListRow = {
  workflowID: string;
  status: WorkflowOpsStatus;
  workflowName: string;
  workflowClassName: string;
  queueName?: string;
  applicationVersion?: string;
  createdAt: number;
  updatedAt?: number;
};

function sortListRows(rows: ListRow[]): ListRow[] {
  return [...rows].sort((a, b) => {
    if (a.workflowID !== b.workflowID) {
      return a.workflowID.localeCompare(b.workflowID);
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.status.localeCompare(b.status);
  });
}

async function doList(service: WorkflowService, args: ParsedArgs): Promise<void> {
  const statuses = args.statuses.length > 0 ? args.statuses : [undefined];
  const merged = new Map<string, ListRow>();
  for (const status of statuses) {
    const rows = await listWorkflows(service, {
      status,
      name: args.name,
      limit: args.limit
    });
    for (const row of rows) {
      merged.set(row.workflowID, row);
    }
  }
  const ordered = sortListRows([...merged.values()]);
  const bounded = ordered.slice(0, args.limit);
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(bounded)}\n`);
    return;
  }
  process.stdout.write(
    `${bounded.map((row) => row.workflowID).join("\n")}${bounded.length ? "\n" : ""}`
  );
}

type MutateResult = {
  workflowID: string;
  forkedWorkflowID?: string;
};

async function applyBatchOperation(
  args: ParsedArgs,
  service: WorkflowService,
  runOp: (workflowID: string) => Promise<OpsActionAck | OpsForkAck>
): Promise<void> {
  const fromStdin = args.useStdin ? await readStdinIds() : [];
  const ids = uniqueSorted(args.ids.concat(fromStdin));
  if (ids.length === 0) {
    fail(`no workflow IDs provided for ${args.command} (use --ids and/or --stdin)`);
  }

  const results: MutateResult[] = [];
  for (const workflowID of ids) {
    const ack = await runOp(workflowID);
    results.push({
      workflowID: ack.workflowID,
      forkedWorkflowID: "forkedWorkflowID" in ack ? ack.forkedWorkflowID : undefined
    });
  }

  for (const row of results) {
    if (row.forkedWorkflowID) {
      process.stdout.write(`${row.workflowID}\t${row.forkedWorkflowID}\n`);
    } else {
      process.stdout.write(`${row.workflowID}\n`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = getConfig();
  const pool = createPool();
  const service = await DBOSClientWorkflowEngine.create(
    cfg.systemDatabaseUrl,
    pool,
    cfg.appVersion
  );

  try {
    if (args.command === "list") {
      await doList(service, args);
      return;
    }

    const actor = args.actor as string;
    const reason = args.reason as string;

    if (args.command === "cancel") {
      await applyBatchOperation(args, service, async (workflowID) =>
        cancelWorkflow(service, workflowID, pool, actor, reason)
      );
      return;
    }
    if (args.command === "resume") {
      await applyBatchOperation(args, service, async (workflowID) =>
        resumeWorkflow(service, workflowID, pool, actor, reason)
      );
      return;
    }

    const stepN = args.stepN as number;
    const reasonTag = args.command === "retry-from-step" ? `retry-from-step:${reason}` : reason;
    await applyBatchOperation(args, service, async (workflowID) =>
      forkWorkflow(
        service,
        workflowID,
        { stepN, appVersion: args.appVersion },
        pool,
        actor,
        reasonTag
      )
    );
  } finally {
    await Promise.allSettled([service.destroy(), pool.end(), closePool()]);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[ops-cli] ${message}\n`);
  process.exit(1);
});
