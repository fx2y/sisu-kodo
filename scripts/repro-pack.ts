import { writeFile } from "node:fs/promises";
import { createPool } from "../src/db/pool";
import { getConfig } from "../src/config";
import { canonicalStringify } from "../src/lib/hash";
import { generateReproSnapshot } from "../src/lib/repro";

type CliArgs = {
  run: string;
  out?: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function parseArgs(argv: string[]): CliArgs {
  let run: string | undefined;
  let out: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--run") {
      run = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--out") {
      out = argv[i + 1];
      i += 1;
      continue;
    }
    fail(`unknown arg: ${arg}`);
  }

  if (!run || run.length === 0) {
    fail("usage: pnpm exec tsx scripts/repro-pack.ts --run <runId|workflowId> [--out <file>]");
  }

  return { run, out };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = getConfig();
  const appPool = createPool(cfg.appDbName);
  const sysPool = createPool(cfg.sysDbName);

  try {
    const snapshot = await generateReproSnapshot(appPool, sysPool, args.run, {
      appDbName: cfg.appDbName,
      sysDbName: cfg.sysDbName
    });

    const encoded = `${canonicalStringify(snapshot)}\n`;
    if (args.out) {
      await writeFile(args.out, encoded, "utf8");
      process.stdout.write(`${args.out}\n`);
      return;
    }
    process.stdout.write(encoded);
  } finally {
    await Promise.allSettled([appPool.end(), sysPool.end()]);
  }
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[repro-pack] ${msg}\n`);
  process.exit(1);
});
