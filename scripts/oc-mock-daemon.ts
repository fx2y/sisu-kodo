import { OCMockDaemon } from "../test/oc-mock-daemon";

async function main() {
  const envPort = process.env.OC_SERVER_PORT ? parseInt(process.env.OC_SERVER_PORT) : undefined;
  const argPort =
    process.argv.length > 2 ? parseInt(process.argv[process.argv.length - 1]) : undefined;
  const port = argPort || envPort || 4096;
  const daemon = new OCMockDaemon(port);
  console.log(`Starting OCMockDaemon on port ${port}`);
  await daemon.start();
}

main().catch(console.error);
