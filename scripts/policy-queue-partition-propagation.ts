import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type WorkflowProbe = {
  hasStartTaskHelper: boolean;
  hasQueuePartitionParam: boolean;
  hasTaskEnqueuePartitionForwarding: boolean;
  hasSharedRunWiring: boolean;
  hasSharedRepairWiring: boolean;
  hasStartTaskForwarding: boolean;
};

type SqlProbe = {
  hasWorkflowStatusSql: boolean;
  hasQueuePartitionAssertion: boolean;
};

function parseSource(code: string, fileName = "file.ts"): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function isIdentifier(node: ts.Node, text: string): node is ts.Identifier {
  return ts.isIdentifier(node) && node.text === text;
}

function isCallTo(node: ts.CallExpression, name: string): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === name;
}

function isStartWorkflowCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  return (
    isIdentifier(node.expression.expression, "DBOS") &&
    node.expression.name.text === "startWorkflow"
  );
}

function findProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  key: string
): ts.ObjectLiteralElementLike | undefined {
  return objectLiteral.properties.find((property) => {
    if (!("name" in property) || !property.name) return false;
    if (ts.isIdentifier(property.name)) return property.name.text === key;
    if (ts.isStringLiteral(property.name)) return property.name.text === key;
    return false;
  });
}

function hasQueuePartitionForwarding(node: ts.CallExpression): boolean {
  const options = node.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) return false;

  const enqueueOptions = findProperty(options, "enqueueOptions");
  if (!enqueueOptions || !ts.isPropertyAssignment(enqueueOptions)) return false;
  if (!ts.isObjectLiteralExpression(enqueueOptions.initializer)) return false;

  const queuePartitionKey = findProperty(enqueueOptions.initializer, "queuePartitionKey");
  if (!queuePartitionKey) return false;
  if (ts.isShorthandPropertyAssignment(queuePartitionKey)) {
    return queuePartitionKey.name.text === "queuePartitionKey";
  }
  if (!ts.isPropertyAssignment(queuePartitionKey)) return false;
  return (
    ts.isIdentifier(queuePartitionKey.initializer) &&
    queuePartitionKey.initializer.text === "queuePartitionKey"
  );
}

function probeWorkflowSource(code: string): WorkflowProbe {
  const sourceFile = parseSource(code, "intentWorkflow.ts");
  const probe: WorkflowProbe = {
    hasStartTaskHelper: false,
    hasQueuePartitionParam: false,
    hasTaskEnqueuePartitionForwarding: false,
    hasSharedRunWiring: false,
    hasSharedRepairWiring: false,
    hasStartTaskForwarding: false
  };

  walk(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "startTaskWorkflow") {
      probe.hasStartTaskHelper = true;
      probe.hasQueuePartitionParam = node.parameters.some(
        (param) => ts.isIdentifier(param.name) && param.name.text === "queuePartitionKey"
      );
    }

    if (ts.isCallExpression(node) && isStartWorkflowCall(node)) {
      probe.hasTaskEnqueuePartitionForwarding ||= hasQueuePartitionForwarding(node);
    }

    if (ts.isCallExpression(node) && isCallTo(node, "runIntentWorkflow")) {
      const firstArg = node.arguments[0];
      if (
        firstArg &&
        ts.isCallExpression(firstArg) &&
        ts.isIdentifier(firstArg.expression) &&
        firstArg.expression.text === "buildIntentWorkflowSteps"
      ) {
        probe.hasSharedRunWiring = true;
      }
    }

    if (ts.isCallExpression(node) && isCallTo(node, "repairRunWorkflow")) {
      const firstArg = node.arguments[0];
      if (
        firstArg &&
        ts.isCallExpression(firstArg) &&
        ts.isIdentifier(firstArg.expression) &&
        firstArg.expression.text === "buildIntentWorkflowSteps"
      ) {
        probe.hasSharedRepairWiring = true;
      }
    }

    if (ts.isPropertyAssignment(node)) {
      if (!ts.isIdentifier(node.name) || node.name.text !== "startTask") return;
      const init = node.initializer;
      if (!ts.isArrowFunction(init)) return;
      if (!ts.isCallExpression(init.body)) return;
      if (
        !ts.isIdentifier(init.body.expression) ||
        init.body.expression.text !== "startTaskWorkflow"
      )
        return;
      const third = init.body.arguments[2];
      probe.hasStartTaskForwarding ||= Boolean(
        third && ts.isIdentifier(third) && third.text === "queuePartitionKey"
      );
    }
  });

  return probe;
}

function probeSqlOracleAssertions(code: string): SqlProbe {
  const sourceFile = parseSource(code, "queue-partition-fairness.test.ts");
  const probe: SqlProbe = {
    hasWorkflowStatusSql: false,
    hasQueuePartitionAssertion: false
  };

  walk(sourceFile, (node) => {
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
      const text = node.text.toLowerCase();
      if (text.includes("from dbos.workflow_status") && text.includes("queue_partition_key")) {
        probe.hasWorkflowStatusSql = true;
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text !== "toBe") return;
      const lhs = node.expression.expression;
      const rhs = node.arguments[0];
      if (
        ts.isCallExpression(lhs) &&
        ts.isIdentifier(lhs.expression) &&
        lhs.expression.text === "expect" &&
        lhs.arguments[0]?.getText(sourceFile) === "sysRes.rows[0].queue_partition_key" &&
        rhs?.getText(sourceFile) === "run.queue_partition_key"
      ) {
        probe.hasQueuePartitionAssertion = true;
      }
    }
  });

  return probe;
}

function assertProbe(label: string, condition: boolean): void {
  if (!condition) {
    throw new Error(`queue-partition policy failure: ${label}`);
  }
}

function runSelfTest(): void {
  const goodWorkflow = `
async function startTaskWorkflow(task, runId, queuePartitionKey) {
  return await DBOS.startWorkflow(IntentWorkflow.taskWorkflow, {
    workflowID: task.taskKey,
    queueName: "sbxQ",
    enqueueOptions: { queuePartitionKey }
  })(task, runId);
}
export function buildIntentWorkflowSteps() {
  return {
    startTask: (task, runId, queuePartitionKey) => startTaskWorkflow(task, runId, queuePartitionKey)
  };
}
class IntentWorkflow {
  static async run(workflowId) { await runIntentWorkflow(buildIntentWorkflowSteps(), workflowId); }
  static async repair(runId) { await repairRunWorkflow(buildIntentWorkflowSteps(), runId); }
}
`;
  const badWorkflow = `
async function startTaskWorkflow(task, runId) {
  return await DBOS.startWorkflow(IntentWorkflow.taskWorkflow, {
    workflowID: task.taskKey,
    queueName: "sbxQ",
    enqueueOptions: {}
  })(task, runId);
}
export function buildIntentWorkflowSteps() {
  return {
    startTask: (task, runId) => startTaskWorkflow(task, runId)
  };
}
`;

  const goodSql = `
const sysRes = await sysPool.query(
  "SELECT queue_name, queue_partition_key FROM dbos.workflow_status WHERE workflow_uuid = $1",
  [sbx.task_key]
);
expect(sysRes.rows[0].queue_partition_key).toBe(run.queue_partition_key);
`;
  const badSql = `
const sysRes = await sysPool.query(
  "SELECT queue_name FROM dbos.workflow_status WHERE workflow_uuid = $1",
  [sbx.task_key]
);
expect(sysRes.rows[0].queue_name).toBe("sbxQ");
`;

  const goodWorkflowProbe = probeWorkflowSource(goodWorkflow);
  const badWorkflowProbe = probeWorkflowSource(badWorkflow);
  const goodSqlProbe = probeSqlOracleAssertions(goodSql);
  const badSqlProbe = probeSqlOracleAssertions(badSql);

  assertProbe("self-test good workflow", Object.values(goodWorkflowProbe).every(Boolean));
  assertProbe(
    "self-test bad workflow",
    !badWorkflowProbe.hasQueuePartitionParam &&
      !badWorkflowProbe.hasTaskEnqueuePartitionForwarding &&
      !badWorkflowProbe.hasStartTaskForwarding
  );
  assertProbe(
    "self-test good sql",
    goodSqlProbe.hasWorkflowStatusSql && goodSqlProbe.hasQueuePartitionAssertion
  );
  assertProbe(
    "self-test bad sql",
    !badSqlProbe.hasWorkflowStatusSql || !badSqlProbe.hasQueuePartitionAssertion
  );
}

function runRepoProbe(): void {
  const workflowFile = resolve("src/workflow/dbos/intentWorkflow.ts");
  const fairnessTestFile = resolve("test/integration/queue-partition-fairness.test.ts");
  const workflowCode = readFileSync(workflowFile, "utf8");
  const fairnessTestCode = readFileSync(fairnessTestFile, "utf8");

  const workflowProbe = probeWorkflowSource(workflowCode);
  const sqlProbe = probeSqlOracleAssertions(fairnessTestCode);

  assertProbe("missing shared startTaskWorkflow helper", workflowProbe.hasStartTaskHelper);
  assertProbe(
    "startTaskWorkflow missing queuePartitionKey parameter",
    workflowProbe.hasQueuePartitionParam
  );
  assertProbe(
    "DBOS startWorkflow enqueueOptions does not forward queuePartitionKey",
    workflowProbe.hasTaskEnqueuePartitionForwarding
  );
  assertProbe(
    "buildIntentWorkflowSteps.startTask does not forward queuePartitionKey",
    workflowProbe.hasStartTaskForwarding
  );
  assertProbe(
    "IntentWorkflow.run must reuse buildIntentWorkflowSteps()",
    workflowProbe.hasSharedRunWiring
  );
  assertProbe(
    "IntentWorkflow.repair must reuse buildIntentWorkflowSteps()",
    workflowProbe.hasSharedRepairWiring
  );
  assertProbe(
    "partition fairness SQL oracle missing workflow_status queue_partition_key query",
    sqlProbe.hasWorkflowStatusSql
  );
  assertProbe(
    "partition fairness SQL oracle missing queue_partition_key equality assertion",
    sqlProbe.hasQueuePartitionAssertion
  );
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("queue-partition-propagation policy self-test: PASS");
    return;
  }
  if (arg) {
    throw new Error("usage: scripts/policy-queue-partition-propagation.sh [--self-test]");
  }

  runSelfTest();
  runRepoProbe();
  console.log("queue-partition-propagation policy: PASS");
}

main();
