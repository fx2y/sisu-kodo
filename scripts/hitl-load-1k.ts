import {
  closeHitlSoakDeps,
  createHitlSoakDeps,
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
  const timeoutMs = readInt("HITL_SOAK_TIMEOUT_MS", 300000);
  const startConcurrency = readInt("HITL_SOAK_START_CONCURRENCY", 32);
  const maxWaitingLocks = readInt("HITL_SOAK_MAX_WAITING_LOCKS", 250);
  const reportPath = process.env.HITL_LOAD_REPORT ?? ".tmp/hitl-load-1k-report.json";

  const deps = await createHitlSoakDeps();
  try {
    const report = await runLoadProbe(deps, {
      targetWaits,
      pollMs,
      timeoutMs,
      startConcurrency,
      queuePartitionKey: process.env.HITL_SOAK_PARTITION_KEY ?? "hitl-c7-load"
    });

    if (report.waiting.readyCount !== targetWaits) {
      throw new Error(
        `load probe incomplete: ready=${report.waiting.readyCount} target=${targetWaits}`
      );
    }
    if (report.pressure.maxWaitingLocks > maxWaitingLocks) {
      throw new Error(
        `load probe lock pressure exceeded limit: maxWaitingLocks=${report.pressure.maxWaitingLocks} limit=${maxWaitingLocks}`
      );
    }

    await writeJsonReport(reportPath, report);
    console.log(`[HITL-C7] load probe PASS waits=${targetWaits} report=${reportPath}`);
  } finally {
    await closeHitlSoakDeps(deps);
  }
}

main().catch((error) => {
  console.error(
    `[HITL-C7] load probe FAIL: ${error instanceof Error ? error.stack : String(error)}`
  );
  process.exit(1);
});
