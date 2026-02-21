import {
  closeHitlSoakDeps,
  createHitlSoakDeps,
  runLoadProbe,
  writeJsonReport
} from "./hitl-soak-core";

async function main(): Promise<void> {
  const targetWaits = Number.parseInt(process.env.N ?? "40", 10);
  if (!Number.isInteger(targetWaits) || targetWaits <= 0) {
    throw new Error(`N must be positive integer; got ${process.env.N ?? "<unset>"}`);
  }

  const deps = await createHitlSoakDeps();
  try {
    const report = await runLoadProbe(deps, {
      targetWaits,
      queuePartitionKey: process.env.HITL_SOAK_PARTITION_KEY ?? "hitl-load-soak"
    });
    const reportPath = process.env.HITL_LOAD_REPORT ?? ".tmp/hitl-load-soak-report.json";
    await writeJsonReport(reportPath, report);
    console.log(`[HITL-LOAD] PASS waits=${targetWaits} report=${reportPath}`);
  } finally {
    await closeHitlSoakDeps(deps);
  }
}

main().catch((error) => {
  console.error(`[HITL-LOAD] FAIL: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
