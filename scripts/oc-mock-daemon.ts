import { OCMockDaemon } from "../test/oc-mock-daemon";

async function main() {
  const port = parseInt(process.argv[process.argv.length - 1]) || 4096;
  const daemon = new OCMockDaemon(port);
  console.log(`Starting OCMockDaemon on port ${port}`);
  await daemon.start();
}

main().catch(console.error);
