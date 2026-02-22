import {
  closeHitlSoakDeps,
  collectSqlEvidence,
  createHitlSoakDeps,
  runBurstReplyProbe,
  runLoadProbe,
  writeJsonReport
} from "./hitl-soak-core";

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; got ${raw}`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const targetWaits = readInt("N", 1000);
  const pollMs = readInt("HITL_SOAK_POLL_MS", 1000);
  const timeoutMs = readInt("HITL_SOAK_TIMEOUT_MS", 900000);
  const startConcurrency = readInt("HITL_SOAK_START_CONCURRENCY", 32);
  const replyConcurrency = readInt("HITL_SOAK_REPLY_CONCURRENCY", 12);
  const duplicateRepliesPerGate = readInt("HITL_SOAK_DUPLICATE_REPLIES", 2);

  const reportPath = process.env.HITL_BURST_REPORT ?? ".tmp/hitl-burst-reply-report.json";
  const evidencePath = process.env.HITL_SQL_EVIDENCE ?? ".tmp/hitl-c7-sql-evidence.json";

  const deps = await createHitlSoakDeps();
  try {
    const load = await runLoadProbe(deps, {
      targetWaits,
      pollMs,
      timeoutMs,
      startConcurrency,
      queuePartitionKey: process.env.HITL_SOAK_PARTITION_KEY ?? "hitl-c7-burst"
    });

    const burst = await runBurstReplyProbe(deps, load.targets, {
      pollMs,
      timeoutMs,
      replyConcurrency,
      duplicateRepliesPerGate,
      dedupePrefix: load.dedupePrefix,
      payload: {
        choice: "yes",
        rationale: "c7-burst"
      }
    });

    if (burst.final.errors !== 0 || burst.final.active !== 0) {
      throw new Error(
        `burst drain incomplete: succeeded=${burst.final.succeeded} active=${burst.final.active} errors=${burst.final.errors}`
      );
    }

    if (burst.interactions.totalRows !== burst.interactions.expectedDistinct) {
      throw new Error(
        `dedupe violation: interaction_rows=${burst.interactions.totalRows} expected=${burst.interactions.expectedDistinct}`
      );
    }

    if (burst.decisions.duplicateDecisionKeys !== 0) {
      throw new Error(`duplicate decision keys found: ${burst.decisions.duplicateDecisionKeys}`);
    }

    const evidence = await collectSqlEvidence(deps, load.targets, burst.dedupePrefix);

    await writeJsonReport(reportPath, {
      load,
      burst
    });
    await writeJsonReport(evidencePath, evidence);

    console.log(
      `[HITL-C7] burst probe PASS waits=${targetWaits} report=${reportPath} evidence=${evidencePath}`
    );
  } finally {
    await closeHitlSoakDeps(deps);
  }
}

main().catch((error) => {
  console.error(
    `[HITL-C7] burst probe FAIL: ${error instanceof Error ? error.stack : String(error)}`
  );
  process.exit(1);
});
