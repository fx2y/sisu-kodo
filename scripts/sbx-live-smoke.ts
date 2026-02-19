import { runSandboxJob } from "../src/sbx/runner";

async function main(): Promise<void> {
  console.log(`sbx-live-smoke starting (provider=${process.env.SBX_PROVIDER ?? "e2b"})`);
  try {
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

    if (result.raw?.status === "UNSUPPORTED") {
      console.log(
        `sbx-live-smoke: provider ${result.raw.provider} returned UNSUPPORTED (deterministic)`
      );
      return;
    }

    if (result.exit !== 0) {
      throw new Error(
        `live smoke failed: exit=${result.exit} errCode=${result.errCode} stderr=${result.stderr}`
      );
    }
    console.log(`sbx-live-smoke success: exit=${result.exit} provider=${result.raw?.provider}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.toLowerCase().includes("e2b_api_key") ||
      message.toLowerCase().includes("api key") ||
      message.toLowerCase().includes("unauthorized")
    ) {
      console.warn(`sbx-live-smoke skipped: provider credentials missing or invalid`);
      return;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
