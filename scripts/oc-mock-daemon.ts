import { OCMockDaemon } from "../test/oc-mock-daemon";

async function main() {
  const port = Number(process.env.OC_SERVER_PORT ?? "4096");
  const daemon = new OCMockDaemon(port);
  console.log(`Starting OC Mock Daemon on port ${port}...`);
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
