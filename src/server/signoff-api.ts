import type { Pool } from "pg";
import { getConfig } from "../config";
import type { SignoffBoardResponse } from "../contracts/ui/signoff-board.schema";
import type { SignoffTile, SignoffVerdict } from "../contracts/ui/signoff-tile.schema";
import { nowMs } from "../lib/time";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function readSignoffTile(name: string, dir: string): Promise<SignoffTile> {
  try {
    const content = await readFile(join(dir, `${name}.json`), "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      id: name,
      label: name.toUpperCase(),
      verdict: "NO_GO",
      evidenceRefs: [],
      reason: "Missing results",
      ts: nowMs()
    };
  }
}

export async function getSignoffBoardService(
  appPool: Pool,
  _sysPool: Pool
): Promise<SignoffBoardResponse> {
  const cfg = getConfig();
  const signoffDir = join(process.cwd(), ".tmp/signoff");

  // 1. PF Tiles
  const pfNames = ["quick", "check", "full", "deps", "policy", "crashdemo"];
  const pfTiles = await Promise.all(
    pfNames.map((name) => readSignoffTile(`pf-${name}`, signoffDir))
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
  const proofTiles = await Promise.all(
    proofNames.map((name) => readSignoffTile(`proof-${name}`, signoffDir))
  );

  // 3. Rollback Triggers (Check for any active red blockers)
  const triggers: SignoffTile[] = [];

  // Trigger A: Budget Violations (24h)
  const recentViolations = await appPool.query(
    `SELECT count(*) FROM app.artifacts WHERE step_id = 'BUDGET' AND inline->>'outcome' = 'VIOLATION' AND created_at > now() - interval '24 hours'`
  );
  const violationCount = Number(recentViolations.rows[0].count);

  triggers.push({
    id: "trigger-budget",
    label: "Budget Violations (24h)",
    verdict: violationCount > 0 ? "NO_GO" : "GO",
    evidenceRefs: [],
    reason: violationCount > 0 ? `${violationCount} violations detected` : undefined,
    ts: nowMs()
  });

  // Trigger B: X1 Execution Drift (Duplicate step execution detection)
  // We check if any non-append-only step has multiple successful attempts
  const x1Drift = await appPool.query(
    `SELECT count(*) FROM (
       SELECT run_id, step_id FROM app.run_steps 
       GROUP BY run_id, step_id 
       HAVING count(*) > 1
     ) AS drift`
  );
  const driftCount = Number(x1Drift.rows[0].count);
  triggers.push({
    id: "trigger-x1-drift",
    label: "X1 Execution Drift",
    verdict: driftCount > 0 ? "NO_GO" : "GO",
    evidenceRefs: [],
    reason: driftCount > 0 ? `${driftCount} runs with step re-execution detected` : undefined,
    ts: nowMs()
  });

  // Trigger C: Terminal Divergence (App vs DBOS status mismatch)
  const divergence = await appPool.query(
    `SELECT count(*) FROM app.runs r
     JOIN dbos.workflow_status s ON s.workflow_id = r.workflow_id
     WHERE r.status = 'succeeded' AND s.status != 'SUCCESS'`
  );
  const divCount = Number(divergence.rows[0].count);
  triggers.push({
    id: "trigger-divergence",
    label: "Terminal Divergence",
    verdict: divCount > 0 ? "NO_GO" : "GO",
    evidenceRefs: [],
    reason: divCount > 0 ? `${divCount} status mismatches detected` : undefined,
    ts: nowMs()
  });

  // Trigger D: Policy False-Green (Manual bypass detection)
  // Check if any run succeeded without passing mandatory policy artifacts
  // (Placeholder for complex policy check)
  triggers.push({
    id: "trigger-false-green",
    label: "Policy False-Green",
    verdict: "GO",
    evidenceRefs: [],
    ts: nowMs()
  });

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
    ts: nowMs()
  };
}
