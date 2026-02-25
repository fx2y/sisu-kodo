import type { Pool } from "pg";
import { getConfig } from "../config";
import type { SignoffBoardResponse } from "../contracts/ui/signoff-board.schema";
import type { SignoffTile, SignoffVerdict } from "../contracts/ui/signoff-tile.schema";
import { assertSignoffTile } from "../contracts/ui/signoff-tile.schema";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

type SignoffTileRead = {
  tile: SignoffTile;
  fileRef: string;
  issues: string[];
};

const ZERO_TS = 0;

function signoffTileFileRef(name: string): string {
  return `file:.tmp/signoff/${name}.json`;
}

function safeTileTs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : ZERO_TS;
}

function toEpochMs(value: unknown): number {
  if (typeof value === "number") return safeTileTs(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : ZERO_TS;
  }
  return ZERO_TS;
}

function normalizeLoadedTile(
  raw: unknown,
  name: string,
  fileRef: string,
  bounds: { commit?: string; tree?: string; appVersion?: string }
): SignoffTileRead {
  const issues: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      tile: {
        id: name,
        label: name.toUpperCase(),
        verdict: "NO_GO",
        evidenceRefs: [fileRef],
        reason: "invalid signoff tile payload (expected object)",
        ts: ZERO_TS
      },
      fileRef,
      issues: ["invalid_object"]
    };
  }
  const src = raw as Record<string, unknown>;
  const evidenceRefs = Array.isArray(src.evidenceRefs)
    ? src.evidenceRefs.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  const tile: SignoffTile = {
    id: typeof src.id === "string" && src.id.length > 0 ? src.id : name,
    label: typeof src.label === "string" && src.label.length > 0 ? src.label : name.toUpperCase(),
    verdict: src.verdict === "GO" || src.verdict === "NO_GO" ? src.verdict : "NO_GO",
    evidenceRefs,
    reason: typeof src.reason === "string" ? src.reason : undefined,
    ts: safeTileTs(src.ts),
    commit: typeof src.commit === "string" ? src.commit : undefined,
    tree: typeof src.tree === "string" ? src.tree : undefined,
    appVersion: typeof src.appVersion === "string" ? src.appVersion : undefined
  };
  try {
    assertSignoffTile(tile);
  } catch {
    return {
      tile: {
        id: name,
        label: name.toUpperCase(),
        verdict: "NO_GO",
        evidenceRefs: [fileRef],
        reason: "invalid signoff tile contract",
        ts: ZERO_TS
      },
      fileRef,
      issues: ["invalid_contract"]
    };
  }

  // Metadata binding checks
  if (bounds.commit && tile.commit && bounds.commit !== tile.commit) {
    issues.push("commit_mismatch");
    tile.verdict = "NO_GO";
    tile.reason = (tile.reason ? tile.reason + "; " : "") + "commit_mismatch";
  }
  if (bounds.tree && tile.tree && bounds.tree !== tile.tree) {
    issues.push("tree_mismatch");
    tile.verdict = "NO_GO";
    tile.reason = (tile.reason ? tile.reason + "; " : "") + "tree_mismatch";
  }
  if (bounds.appVersion && tile.appVersion && bounds.appVersion !== tile.appVersion) {
    issues.push("app_version_mismatch");
    tile.verdict = "NO_GO";
    tile.reason = (tile.reason ? tile.reason + "; " : "") + "app_version_mismatch";
  }

  if (tile.evidenceRefs.length === 0) {
    issues.push("missing_evidence_refs");
    tile.evidenceRefs = [fileRef];
  }
  return { tile, fileRef, issues };
}

async function readSignoffTile(
  name: string,
  dir: string,
  bounds: { commit?: string; tree?: string; appVersion?: string }
): Promise<SignoffTileRead> {
  const fileRef = signoffTileFileRef(name);
  try {
    const path = join(dir, `${name}.json`);
    const [content, info] = await Promise.all([readFile(path, "utf-8"), stat(path)]);
    const parsed = JSON.parse(content) as unknown;
    const read = normalizeLoadedTile(parsed, name, fileRef, bounds);
    if (read.tile.ts === ZERO_TS && Number.isFinite(info.mtimeMs)) {
      read.tile.ts = Math.max(ZERO_TS, Math.trunc(info.mtimeMs));
    }
    return read;
  } catch {
    return {
      tile: {
        id: name,
        label: name.toUpperCase(),
        verdict: "NO_GO",
        evidenceRefs: [fileRef],
        reason: "missing signoff results",
        ts: ZERO_TS
      },
      fileRef,
      issues: ["missing_file"]
    };
  }
}

function tileTs(tiles: SignoffTile[]): number {
  return tiles.reduce((max, tile) => Math.max(max, tile.ts), ZERO_TS);
}

function finalizeMandatoryTiles(
  reads: SignoffTileRead[],
  label: "pf" | "proof"
): {
  tiles: SignoffTile[];
  falseGreenTileIDs: string[];
} {
  const falseGreenTileIDs: string[] = [];
  const tiles = reads.map((read) => {
    const tile = { ...read.tile };
    if (read.issues.includes("missing_evidence_refs")) {
      falseGreenTileIDs.push(tile.id);
      tile.verdict = "NO_GO";
      tile.reason = `${label}_tile_missing_evidence_refs`;
    }
    return tile;
  });
  return { tiles, falseGreenTileIDs };
}

async function queryBudgetViolationTrigger(appPool: Pool): Promise<SignoffTile> {
  const recentViolations = await appPool.query<{
    count: string;
    latest_ts: string | number | null;
  }>(
    `SELECT COUNT(*)::text AS count,
            COALESCE(MAX((EXTRACT(EPOCH FROM created_at) * 1000)::bigint), 0)::bigint AS latest_ts
       FROM app.artifacts
      WHERE step_id = 'BUDGET'
        AND inline->>'outcome' = 'VIOLATION'
        AND created_at > now() - interval '24 hours'`
  );
  const row = recentViolations.rows[0] ?? { count: "0", latest_ts: 0 };
  const violationCount = Number(row.count);
  return {
    id: "trigger-budget",
    label: "Budget Violations (24h)",
    verdict: violationCount > 0 ? "NO_GO" : "GO",
    evidenceRefs: ["sql:app.artifacts#budget_violation_24h"],
    reason: violationCount > 0 ? `${violationCount} violations detected` : undefined,
    ts: toEpochMs(row.latest_ts)
  };
}

async function queryX1Trigger(appPool: Pool): Promise<SignoffTile> {
  const [receiptDupes, interactionDupes] = await Promise.all([
    appPool.query<{ count: string; latest_ts: string | number | null }>(
      `SELECT COUNT(*)::text AS count,
              COALESCE(MAX((EXTRACT(EPOCH FROM updated_at) * 1000)::bigint), 0)::bigint AS latest_ts
         FROM app.mock_receipts
        WHERE seen_count > 1`
    ),
    appPool.query<{ count: string; latest_ts: string | number | null }>(
      `WITH dup AS (
         SELECT MAX(created_at) AS latest_created_at
           FROM app.human_interactions
          GROUP BY workflow_id, gate_key, topic, dedupe_key
         HAVING COUNT(*) > 1
       )
       SELECT COUNT(*)::text AS count,
              COALESCE(MAX((EXTRACT(EPOCH FROM latest_created_at) * 1000)::bigint), 0)::bigint AS latest_ts
         FROM dup`
    )
  ]);
  const receiptCount = Number(receiptDupes.rows[0]?.count ?? "0");
  const interactionCount = Number(interactionDupes.rows[0]?.count ?? "0");
  const active = receiptCount > 0 || interactionCount > 0;
  const reasonParts: string[] = [];
  if (receiptCount > 0) reasonParts.push(`mock_receipts_seen_count_gt1=${receiptCount}`);
  if (interactionCount > 0)
    reasonParts.push(`human_interactions_x1_tuple_dupes=${interactionCount}`);
  return {
    id: "trigger-x1-drift",
    label: "Duplicate Side-Effects / X1 Keys",
    verdict: active ? "NO_GO" : "GO",
    evidenceRefs: [
      "sql:app.mock_receipts#seen_count_gt_1",
      "sql:app.human_interactions#x1_tuple_dupes"
    ],
    reason: active ? reasonParts.join("; ") : undefined,
    ts: Math.max(
      toEpochMs(receiptDupes.rows[0]?.latest_ts ?? 0),
      toEpochMs(interactionDupes.rows[0]?.latest_ts ?? 0)
    )
  };
}

async function queryTerminalDivergenceTrigger(appPool: Pool, sysPool: Pool): Promise<SignoffTile> {
  const appRuns = await appPool.query<{ workflow_id: string; updated_ts: string | number }>(
    `SELECT workflow_id,
            (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_ts
       FROM app.runs
      WHERE status = 'succeeded'
      ORDER BY updated_at DESC`
  );
  const workflowIDs = appRuns.rows.map((row) => row.workflow_id);
  let mismatchCount = 0;
  const samples: string[] = [];
  if (workflowIDs.length > 0) {
    const sysRows = await sysPool.query<{ workflow_uuid: string; status: string }>(
      `SELECT workflow_uuid, status
         FROM dbos.workflow_status
        WHERE workflow_uuid = ANY($1::text[])`,
      [workflowIDs]
    );
    const byWorkflowID = new Map(sysRows.rows.map((row) => [row.workflow_uuid, row.status]));
    for (const workflowID of workflowIDs) {
      const dbosStatus = byWorkflowID.get(workflowID);
      if (dbosStatus !== "SUCCESS") {
        mismatchCount += 1;
        if (samples.length < 3) {
          samples.push(`${workflowID}:${dbosStatus ?? "MISSING"}`);
        }
      }
    }
  }
  return {
    id: "trigger-divergence",
    label: "Terminal Divergence",
    verdict: mismatchCount > 0 ? "NO_GO" : "GO",
    evidenceRefs: [
      "sql:app.runs#status_succeeded",
      "sql:dbos.workflow_status#workflow_uuid_status"
    ],
    reason:
      mismatchCount > 0
        ? `${mismatchCount} app/dbos terminal mismatches (${samples.join(", ")})`
        : undefined,
    ts: Math.max(...appRuns.rows.map((row) => toEpochMs(row.updated_ts)), ZERO_TS)
  };
}

function buildPolicyFalseGreenTrigger(
  falseGreenTileIDs: string[],
  mandatoryTiles: SignoffTile[]
): SignoffTile {
  const active = falseGreenTileIDs.length > 0;
  return {
    id: "trigger-false-green",
    label: "Policy False-Green",
    verdict: active ? "NO_GO" : "GO",
    evidenceRefs: active
      ? ["policy:signoff:mandatory-evidence", ...falseGreenTileIDs.map((id) => `tile:${id}`)]
      : ["policy:signoff:mandatory-evidence"],
    reason: active
      ? `mandatory_go_tile_missing_evidence: ${falseGreenTileIDs.join(",")}`
      : undefined,
    ts: tileTs(mandatoryTiles)
  };
}

export async function getSignoffBoardService(
  appPool: Pool,
  sysPool: Pool
): Promise<SignoffBoardResponse> {
  const cfg = getConfig();
  const bounds = {
    commit: process.env.SIGNOFF_COMMIT,
    tree: process.env.SIGNOFF_TREE,
    appVersion: cfg.appVersion
  };

  const signoffDir = join(process.cwd(), ".tmp/signoff");

  // 1. PF Tiles
  const pfNames = ["quick", "check", "full", "deps", "policy", "crashdemo"];
  const pfReads = await Promise.all(
    pfNames.map((name) => readSignoffTile(`pf-${name}`, signoffDir, bounds))
  );

  // 2. Proof Tiles
  const proofNames = [
    "api-run-idem",
    "api-run-drift",
    "malformed-400",
    "x1-audit",
    "split-parity",
    "hitl-dedupe",
    "queue-fairness",
    "budget-guard"
  ];
  const proofReads = await Promise.all(
    proofNames.map((name) => readSignoffTile(`proof-${name}`, signoffDir, bounds))
  );
  const { tiles: pfTiles, falseGreenTileIDs: pfFalseGreenIDs } = finalizeMandatoryTiles(
    pfReads,
    "pf"
  );
  const { tiles: proofTiles, falseGreenTileIDs: proofFalseGreenIDs } = finalizeMandatoryTiles(
    proofReads,
    "proof"
  );
  const falseGreenTileIDs = [...pfFalseGreenIDs, ...proofFalseGreenIDs];

  // 3. Rollback Triggers (Check for any active red blockers)
  const triggers: SignoffTile[] = [];
  triggers.push(await queryBudgetViolationTrigger(appPool));
  triggers.push(await queryX1Trigger(appPool));
  triggers.push(await queryTerminalDivergenceTrigger(appPool, sysPool));
  triggers.push(buildPolicyFalseGreenTrigger(falseGreenTileIDs, [...pfTiles, ...proofTiles]));

  // Calculate Overall Verdict
  const allTiles = [...pfTiles, ...proofTiles, ...triggers];
  const verdict: SignoffVerdict = allTiles.every((t) => t.verdict === "GO") ? "GO" : "NO_GO";

  return {
    verdict,
    posture: {
      topology: cfg.workflowRuntimeMode,
      runtimeMode: cfg.workflowRuntimeMode,
      ocMode: cfg.ocMode,
      sbxMode: cfg.sbxMode,
      sbxProvider: cfg.sbxProvider,
      appVersion: cfg.appVersion,
      claimScope: cfg.claimScope
    },
    pfTiles,
    proofTiles,
    rollbackTriggers: triggers,
    ts: tileTs(allTiles)
  };
}
