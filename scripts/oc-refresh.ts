import { runOC } from "../src/oc/client";

async function main(): Promise<void> {
  const out = await runOC({
    intent: "refresh-fixture",
    schemaVersion: 1,
    seed: process.env.TEST_SEED ?? "424242",
    mode: "record",
    producer: async () => ({
      prompt: "refresh",
      toolcalls: [{ name: "noop", args: { value: 1 } }],
      responses: [{ ok: true }],
      diffs: []
    })
  });
  console.log(`fixture-key=${out.key}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
