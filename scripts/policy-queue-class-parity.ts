import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const CANONICAL_QUEUE_CLASSES = new Set(["compileQ", "sbxQ", "controlQ", "intentQ"]);
const EXPECTED_MANAGED_KNOBS: Record<string, Record<string, string>> = {
  sbxQ: {
    concurrency: "${SBX_QUEUE_CONCURRENCY}",
    worker_concurrency: "${SBX_QUEUE_WORKER_CONCURRENCY}",
    rate_limit_per_period: "${SBX_QUEUE_RATE_LIMIT_PER_PERIOD}",
    rate_limit_period_sec: "${SBX_QUEUE_RATE_LIMIT_PERIOD_SEC}",
    priority_enabled: "${SBX_QUEUE_PRIORITY_ENABLED}",
    partition_queue: "${SBX_QUEUE_PARTITION}"
  },
  intentQ: {
    concurrency: "${INTENT_QUEUE_CONCURRENCY}",
    worker_concurrency: "${INTENT_QUEUE_WORKER_CONCURRENCY}",
    rate_limit_per_period: "${INTENT_QUEUE_RATE_LIMIT_PER_PERIOD}",
    rate_limit_period_sec: "${INTENT_QUEUE_RATE_LIMIT_PERIOD_SEC}",
    priority_enabled: "${INTENT_QUEUE_PRIORITY_ENABLED}",
    partition_queue: "${INTENT_QUEUE_PARTITION}"
  }
};

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

function extractYamlQueueKnobs(yamlText: string): Record<string, Record<string, string>> {
  const lines = yamlText.split(/\r?\n/);
  const knobs: Record<string, Record<string, string>> = {};
  let inQueues = false;
  let queuesIndent = -1;
  let currentQueue = "";
  let queueIndent = -1;

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
      currentQueue = "";
      continue;
    }

    const queueMatch = /^([A-Za-z0-9_]+):\s*$/.exec(trimmed);
    if (queueMatch && indent === queuesIndent + 2) {
      currentQueue = queueMatch[1];
      queueIndent = indent;
      knobs[currentQueue] = {};
      continue;
    }

    if (!currentQueue || indent <= queueIndent) continue;
    const kvMatch = /^([A-Za-z0-9_]+):\s+(.+)$/.exec(trimmed);
    if (!kvMatch) continue;
    knobs[currentQueue][kvMatch[1]] = kvMatch[2];
  }

  return knobs;
}

function assertPolicy(label: string, condition: boolean): void {
  if (!condition) throw new Error(`queue-class-parity policy failure: ${label}`);
}

function assertCanonicalOnly(label: string, classes: string[]): void {
  const extras = classes.filter((name) => !CANONICAL_QUEUE_CLASSES.has(name));
  assertPolicy(
    `${label} contains non-canonical queue classes: ${extras.join(",")}`,
    extras.length === 0
  );
  for (const required of CANONICAL_QUEUE_CLASSES) {
    assertPolicy(`${label} missing canonical queue class: ${required}`, classes.includes(required));
  }
}

function assertManagedQueueKnobParity(
  label: string,
  knobs: Record<string, Record<string, string>>
): void {
  for (const [queueName, expected] of Object.entries(EXPECTED_MANAGED_KNOBS)) {
    const queueKnobs = knobs[queueName] ?? {};
    for (const [key, expectedValue] of Object.entries(expected)) {
      assertPolicy(
        `${label} missing ${queueName}.${key}`,
        Object.prototype.hasOwnProperty.call(queueKnobs, key)
      );
      assertPolicy(
        `${label} drift ${queueName}.${key}: expected ${expectedValue}, got ${queueKnobs[key]}`,
        queueKnobs[key] === expectedValue
      );
    }
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
      concurrency: \${SBX_QUEUE_CONCURRENCY}
      worker_concurrency: \${SBX_QUEUE_WORKER_CONCURRENCY}
      rate_limit_per_period: \${SBX_QUEUE_RATE_LIMIT_PER_PERIOD}
      rate_limit_period_sec: \${SBX_QUEUE_RATE_LIMIT_PERIOD_SEC}
      priority_enabled: \${SBX_QUEUE_PRIORITY_ENABLED}
      partition_queue: \${SBX_QUEUE_PARTITION}
    controlQ:
      concurrency: 1
    intentQ:
      concurrency: \${INTENT_QUEUE_CONCURRENCY}
      worker_concurrency: \${INTENT_QUEUE_WORKER_CONCURRENCY}
      rate_limit_per_period: \${INTENT_QUEUE_RATE_LIMIT_PER_PERIOD}
      rate_limit_period_sec: \${INTENT_QUEUE_RATE_LIMIT_PERIOD_SEC}
      priority_enabled: \${INTENT_QUEUE_PRIORITY_ENABLED}
      partition_queue: \${INTENT_QUEUE_PARTITION}
`;
  const badYaml = `
runtimeConfig:
  queues:
    compileQ:
      concurrency: 1
    fixturesQ:
      concurrency: 1
    intentQ:
      concurrency: 1
`;

  const goodTsClasses = extractWorkflowQueueClasses(goodTs);
  const badTsClasses = extractWorkflowQueueClasses(badTs);
  const goodYamlClasses = extractYamlQueueClasses(goodYaml);
  const badYamlClasses = extractYamlQueueClasses(badYaml);
  const goodYamlKnobs = extractYamlQueueKnobs(goodYaml);

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
  assertManagedQueueKnobParity("self-test good YAML knobs", goodYamlKnobs);
}

function runRepoProbe(): void {
  const queueTs = readFileSync(resolve("src/workflow/dbos/queues.ts"), "utf8");
  const dbosYaml = readFileSync(resolve("dbos-config.yaml"), "utf8");
  const tsClasses = extractWorkflowQueueClasses(queueTs);
  const yamlClasses = extractYamlQueueClasses(dbosYaml);
  const yamlKnobs = extractYamlQueueKnobs(dbosYaml);

  assertCanonicalOnly("src/workflow/dbos/queues.ts", tsClasses);
  assertCanonicalOnly("dbos-config.yaml", yamlClasses);
  assertManagedQueueKnobParity("dbos-config.yaml", yamlKnobs);
  assertPolicy("TS/YAML queue class mismatch", tsClasses.join(",") === yamlClasses.join(","));
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
