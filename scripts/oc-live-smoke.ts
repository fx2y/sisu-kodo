import { runOC } from "../src/oc/client";
import { getConfig } from "../src/config";

async function main(): Promise<void> {
  const cfg = getConfig();
  const out = await runOC({
    intent: "live-smoke",
    schemaVersion: 1,
    seed: process.env.TEST_SEED ?? "424242",
    mode: "live",
    producer: async () => ({
      prompt: "live-smoke",
      toolcalls: [{ name: "live_stub", args: { baseUrl: cfg.ocBaseUrl } }],
      responses: [{ live: true }],
      diffs: []
    })
  });
  console.log(`oc-live-smoke key=${out.key}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
