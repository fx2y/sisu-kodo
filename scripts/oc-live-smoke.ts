import { runOC } from "../src/oc/client";

async function main(): Promise<void> {
  const out = await runOC({
    intent: "live-smoke",
    schemaVersion: 1,
    seed: process.env.TEST_SEED ?? "424242",
    mode: "live",
    producer: async () => ({
      prompt: "live-smoke",
      toolcalls: [
        { name: "live_stub", args: { configured: Boolean(process.env.OC_LIVE_ENDPOINT) } }
      ],
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
