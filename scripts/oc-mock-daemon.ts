import { OCMockDaemon } from "../test/oc-mock-daemon";

async function main() {
  const daemon = new OCMockDaemon();
  console.log("Starting OC Mock Daemon on port 4096...");
  await daemon.start();

  process.on("SIGINT", async () => {
    await daemon.stop();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await daemon.stop();
    process.exit(0);
  });
}

main().catch(console.error);
