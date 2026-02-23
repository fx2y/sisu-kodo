import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import ts from "typescript";

type Probe = {
  hasDbosLaunch: boolean;
  hasDbosStartWorkflow: boolean;
};

function parseSource(code: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function isDbosCall(node: ts.CallExpression, method: "launch" | "startWorkflow"): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  return (
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "DBOS" &&
    node.expression.name.text === method
  );
}

function probeSource(code: string, fileName: string): Probe {
  const sourceFile = parseSource(code, fileName);
  const probe: Probe = { hasDbosLaunch: false, hasDbosStartWorkflow: false };
  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    if (isDbosCall(node, "launch")) probe.hasDbosLaunch = true;
    if (isDbosCall(node, "startWorkflow")) probe.hasDbosStartWorkflow = true;
  });
  return probe;
}

function listTsFiles(rootDir: string): string[] {
  const out: string[] = [];
  const stack = [resolve(rootDir)];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      const next = resolve(current, entry);
      const st = statSync(next);
      if (st.isDirectory()) {
        stack.push(next);
        continue;
      }
      const ext = extname(next);
      if (ext === ".ts" || ext === ".tsx") {
        out.push(next);
      }
    }
  }
  return out;
}

function assertProbe(label: string, condition: boolean): void {
  if (!condition) throw new Error(`api-no-dbos-launch policy failure: ${label}`);
}

function assertCleanFile(filePath: string): void {
  const code = readFileSync(filePath, "utf8");
  const probe = probeSource(code, filePath);
  if (probe.hasDbosLaunch || probe.hasDbosStartWorkflow) {
    const relPath = relative(process.cwd(), filePath);
    throw new Error(
      `api-no-dbos-launch policy failure: forbidden DBOS API in ${relPath} (launch=${probe.hasDbosLaunch}, startWorkflow=${probe.hasDbosStartWorkflow})`
    );
  }
}

function runSelfTest(): void {
  const good = `
import { getServices } from "@src/server/singleton";
export async function POST(req: Request) {
  const svc = await getServices();
  return svc;
}
`;
  const badLaunch = `
import { DBOS } from "@dbos-inc/dbos-sdk";
export async function run() {
  await DBOS.launch();
}
`;
  const badStart = `
import { DBOS } from "@dbos-inc/dbos-sdk";
export function run() {
  return DBOS.startWorkflow(Job.run, { workflowID: "w1", queueName: "intentQ" })();
}
`;

  const goodProbe = probeSource(good, "good.ts");
  const badLaunchProbe = probeSource(badLaunch, "bad-launch.ts");
  const badStartProbe = probeSource(badStart, "bad-start.ts");

  assertProbe(
    "self-test good fixture",
    !goodProbe.hasDbosLaunch && !goodProbe.hasDbosStartWorkflow
  );
  assertProbe("self-test bad launch fixture", badLaunchProbe.hasDbosLaunch);
  assertProbe("self-test bad startWorkflow fixture", badStartProbe.hasDbosStartWorkflow);
}

function runRepoProbe(): void {
  const roots = ["src/server", "app/api"];
  for (const root of roots) {
    for (const filePath of listTsFiles(root)) {
      assertCleanFile(filePath);
    }
  }
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("api-no-dbos-launch policy self-test: PASS");
    return;
  }
  if (arg) {
    throw new Error("usage: scripts/policy-api-no-dbos-launch.sh [--self-test]");
  }
  runSelfTest();
  runRepoProbe();
  console.log("api-no-dbos-launch policy: PASS");
}

main();
