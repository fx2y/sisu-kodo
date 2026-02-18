import { runSandboxJob } from "../src/sbx/runner";

async function main(): Promise<void> {
  const result = await runSandboxJob(
    {
      envRef: "local-node-24",
      cmd: process.env.SBX_LIVE_CMD ?? "echo sbx-live-stub",
      filesIn: [],
      env: {},
      timeoutMs: 30000,
      limits: { cpu: 1, memMB: 512 },
      net: false,
      taskKey: "sbx-live-smoke"
    },
    "live"
  );

  if (result.exit !== 0) {
    throw new Error(`live smoke failed: ${result.exit}`);
  }
  console.log(`sbx-live-smoke exit=${result.exit}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
