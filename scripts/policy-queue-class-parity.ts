import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const CANONICAL_QUEUE_CLASSES = new Set(["compileQ", "sbxQ", "controlQ", "intentQ"]);

function parseSource(code: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function extractWorkflowQueueClasses(tsCode: string): string[] {
  const source = parseSource(tsCode, "queues.ts");
  const found = new Set<string>();
  walk(source, (node) => {
    if (!ts.isNewExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== "WorkflowQueue") return;
    const firstArg = node.arguments?.[0];
    if (firstArg && ts.isStringLiteral(firstArg)) {
      found.add(firstArg.text);
    }
  });
  return [...found].sort();
}

function extractYamlQueueClasses(yamlText: string): string[] {
  const lines = yamlText.split(/\r?\n/);
  const found = new Set<string>();
  let inQueues = false;
  let queuesIndent = -1;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    if (!inQueues) {
      if (trimmed === "queues:") {
        inQueues = true;
        queuesIndent = indent;
      }
      continue;
    }

    if (indent <= queuesIndent) {
      inQueues = false;
      continue;
    }

    const match = /^([A-Za-z0-9_]+):\s*$/.exec(trimmed);
    if (!match) continue;
    if (indent === queuesIndent + 2) {
      found.add(match[1]);
    }
  }

  return [...found].sort();
}

function assertPolicy(label: string, condition: boolean): void {
  if (!condition) throw new Error(`queue-class-parity policy failure: ${label}`);
}

function assertCanonicalOnly(label: string, classes: string[]): void {
  const extras = classes.filter((name) => !CANONICAL_QUEUE_CLASSES.has(name));
  assertPolicy(`${label} contains non-canonical queue classes: ${extras.join(",")}`, extras.length === 0);
  for (const required of CANONICAL_QUEUE_CLASSES) {
    assertPolicy(`${label} missing canonical queue class: ${required}`, classes.includes(required));
  }
}

function runSelfTest(): void {
  const goodTs = `
import { WorkflowQueue } from "@dbos-inc/dbos-sdk";
new WorkflowQueue("compileQ");
new WorkflowQueue("sbxQ");
new WorkflowQueue("controlQ");
new WorkflowQueue("intentQ");
`;
  const badTs = `
import { WorkflowQueue } from "@dbos-inc/dbos-sdk";
new WorkflowQueue("compileQ");
new WorkflowQueue("fixturesQ");
`;
  const goodYaml = `
runtimeConfig:
  queues:
    compileQ:
      concurrency: 1
    sbxQ:
      concurrency: 1
    controlQ:
      concurrency: 1
    intentQ:
      concurrency: 1
`;
  const badYaml = `
runtimeConfig:
  queues:
    compileQ:
      concurrency: 1
    fixturesQ:
      concurrency: 1
`;

  const goodTsClasses = extractWorkflowQueueClasses(goodTs);
  const badTsClasses = extractWorkflowQueueClasses(badTs);
  const goodYamlClasses = extractYamlQueueClasses(goodYaml);
  const badYamlClasses = extractYamlQueueClasses(badYaml);

  assertCanonicalOnly("self-test good TS", goodTsClasses);
  assertPolicy(
    "self-test bad TS should detect fixturesQ",
    badTsClasses.some((queueName) => !CANONICAL_QUEUE_CLASSES.has(queueName))
  );
  assertCanonicalOnly("self-test good YAML", goodYamlClasses);
  assertPolicy(
    "self-test bad YAML should detect fixturesQ",
    badYamlClasses.some((queueName) => !CANONICAL_QUEUE_CLASSES.has(queueName))
  );
}

function runRepoProbe(): void {
  const queueTs = readFileSync(resolve("src/workflow/dbos/queues.ts"), "utf8");
  const dbosYaml = readFileSync(resolve("dbos-config.yaml"), "utf8");
  const tsClasses = extractWorkflowQueueClasses(queueTs);
  const yamlClasses = extractYamlQueueClasses(dbosYaml);

  assertCanonicalOnly("src/workflow/dbos/queues.ts", tsClasses);
  assertCanonicalOnly("dbos-config.yaml", yamlClasses);
  assertPolicy(
    "TS/YAML queue class mismatch",
    tsClasses.join(",") === yamlClasses.join(",")
  );
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("queue-class-parity policy self-test: PASS");
    return;
  }
  if (arg) {
    throw new Error("usage: scripts/policy-queue-class-parity.sh [--self-test]");
  }
  runSelfTest();
  runRepoProbe();
  console.log("queue-class-parity policy: PASS");
}

main();
