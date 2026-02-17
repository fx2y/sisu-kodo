import { runSandboxJob } from "../src/sbx/runner";

async function main(): Promise<void> {
  const result = await runSandboxJob({
    mode: "live",
    command: process.env.SBX_LIVE_CMD ?? "echo sbx-live-stub"
  });

  if (result.exitCode !== 0) {
    throw new Error(`live smoke failed: ${result.exitCode}`);
  }
  console.log(`sbx-live-smoke exit=${result.exitCode}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
