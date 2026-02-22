import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createPool, closePool } from "../src/db/pool";
import { insertSbxTemplate } from "../src/db/sbxTemplateRepo";
import { sha256 } from "../src/lib/hash";

type Args = {
  out: string;
  recipeId?: string;
  recipeV?: string;
  depsHash?: string;
  templateId?: string;
  register: boolean;
};

function parseArgs(argv: string[]): Args {
  const out = process.env.SBX_TEMPLATE_BUILD_OUT ?? ".tmp/sbx-template-build.json";
  const args: Args = { out, register: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--out" && next) {
      args.out = next;
      i++;
      continue;
    }
    if (a === "--recipe-id" && next) {
      args.recipeId = next;
      i++;
      continue;
    }
    if (a === "--recipe-v" && next) {
      args.recipeV = next;
      i++;
      continue;
    }
    if (a === "--deps-hash" && next) {
      args.depsHash = next;
      i++;
      continue;
    }
    if (a === "--template-id" && next) {
      args.templateId = next;
      i++;
      continue;
    }
    if (a === "--register") {
      args.register = true;
      continue;
    }
    throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const assetDir = path.resolve("sbx/e2b");
  const dockerfilePath = path.join(assetDir, "e2b.Dockerfile");
  const tomlPath = path.join(assetDir, "e2b.toml");
  const lockPath = path.resolve("pnpm-lock.yaml");

  const [dockerfile, toml, lockfile] = await Promise.all([
    fs.readFile(dockerfilePath, "utf8"),
    fs.readFile(tomlPath, "utf8"),
    readTextIfExists(lockPath)
  ]);

  const depsHash = args.depsHash ?? sha256({ dockerfile, toml, lockfile });
  const recipeId = args.recipeId ?? "local";
  const recipeV = args.recipeV ?? "dev";
  const templateKey = `${recipeId}:${recipeV}:${depsHash}`;
  const templateId =
    args.templateId ??
    `tpl_${sha256({ templateKey, dockerfile, toml }).slice(0, 24)}`;

  const metadata = {
    recipeId,
    recipeV,
    depsHash,
    templateKey,
    templateId,
    assets: {
      dockerfile: path.relative(process.cwd(), dockerfilePath),
      e2bToml: path.relative(process.cwd(), tomlPath),
      lockfile: lockfile.length > 0 ? path.relative(process.cwd(), lockPath) : null
    },
    build: {
      mode: args.register ? "register" : "metadata-only"
    }
  };

  if (args.register) {
    const pool = createPool();
    try {
      await insertSbxTemplate(
        pool,
        { recipeId, recipeV, depsHash },
        { templateKey, templateId, buildMeta: metadata.build as Record<string, unknown> }
      );
    } finally {
      await pool.end();
      await closePool();
    }
  }

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}

void main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

