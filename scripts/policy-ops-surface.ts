import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

type RouteCallSpec = {
  file: string;
  fnName: "cancelWorkflow" | "resumeWorkflow" | "forkWorkflow";
  actorArgIndex: number;
  reasonArgIndex: number;
};

function assertPolicy(label: string, condition: boolean): void {
  if (!condition) {
    throw new Error(`ops-surface policy failure: ${label}`);
  }
}

function parseSource(code: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function listRouteFiles(rootDir: string): string[] {
  const out: string[] = [];
  const stack = [resolve(rootDir)];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      const full = resolve(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry === "route.ts") {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function isBodyPropertyAccess(node: ts.Node | undefined, property: "actor" | "reason"): boolean {
  return (
    !!node &&
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "body" &&
    node.name.text === property
  );
}

function hasRequiredCallShape(code: string, spec: RouteCallSpec): boolean {
  const source = parseSource(code, spec.file);
  let foundValid = false;
  walk(source, (node) => {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== spec.fnName) return;
    const actorArg = node.arguments[spec.actorArgIndex];
    const reasonArg = node.arguments[spec.reasonArgIndex];
    if (isBodyPropertyAccess(actorArg, "actor") && isBodyPropertyAccess(reasonArg, "reason")) {
      foundValid = true;
    }
  });
  return foundValid;
}

function hasForkUpperBoundGuard(code: string): boolean {
  const source = parseSource(code, "ops-api.ts");
  let found = false;
  walk(source, (node) => {
    if (!ts.isBinaryExpression(node)) return;
    if (node.operatorToken.kind !== ts.SyntaxKind.GreaterThanToken) return;
    const left = node.left.getText(source).replace(/\s+/g, "");
    const right = node.right.getText(source).replace(/\s+/g, "");
    if (left === "request.stepN" && right === "maxStep") {
      found = true;
    }
  });
  return found;
}

function runSelfTest(): void {
  const goodCancel = `cancelWorkflow(workflow, payload.id, pool, body.actor, body.reason);`;
  const badCancel = `cancelWorkflow(workflow, payload.id, pool);`;
  const goodFork = `forkWorkflow(workflow, payload.id, body, pool, body.actor, body.reason);`;
  const badFork = `forkWorkflow(workflow, payload.id, body, pool, payload.actor, payload.reason);`;
  const goodOpsApi = `if (request.stepN > maxStep) throw new Error("bad step");`;
  const badOpsApi = `if (request.stepN >= maxStep) throw new Error("bad step");`;

  assertPolicy(
    "self-test good cancel shape",
    hasRequiredCallShape(goodCancel, {
      file: "good-cancel.ts",
      fnName: "cancelWorkflow",
      actorArgIndex: 3,
      reasonArgIndex: 4
    })
  );
  assertPolicy(
    "self-test bad cancel shape",
    !hasRequiredCallShape(badCancel, {
      file: "bad-cancel.ts",
      fnName: "cancelWorkflow",
      actorArgIndex: 3,
      reasonArgIndex: 4
    })
  );
  assertPolicy(
    "self-test good fork shape",
    hasRequiredCallShape(goodFork, {
      file: "good-fork.ts",
      fnName: "forkWorkflow",
      actorArgIndex: 4,
      reasonArgIndex: 5
    })
  );
  assertPolicy(
    "self-test bad fork shape",
    !hasRequiredCallShape(badFork, {
      file: "bad-fork.ts",
      fnName: "forkWorkflow",
      actorArgIndex: 4,
      reasonArgIndex: 5
    })
  );
  assertPolicy("self-test good fork upper-bound guard", hasForkUpperBoundGuard(goodOpsApi));
  assertPolicy("self-test bad fork upper-bound guard", !hasForkUpperBoundGuard(badOpsApi));
}

function runRepoProbe(): void {
  const routesRoot = resolve("app/api/ops/wf");
  const routeFiles = listRouteFiles(routesRoot);
  assertPolicy(
    `expected exactly 6 /api/ops/wf* routes, found ${routeFiles.length}: ${routeFiles
      .map((file) => relative(process.cwd(), file))
      .join(", ")}`,
    routeFiles.length === 6
  );

  const callSpecs: RouteCallSpec[] = [
    {
      file: resolve("app/api/ops/wf/[wid]/cancel/route.ts"),
      fnName: "cancelWorkflow",
      actorArgIndex: 3,
      reasonArgIndex: 4
    },
    {
      file: resolve("app/api/ops/wf/[wid]/resume/route.ts"),
      fnName: "resumeWorkflow",
      actorArgIndex: 3,
      reasonArgIndex: 4
    },
    {
      file: resolve("app/api/ops/wf/[wid]/fork/route.ts"),
      fnName: "forkWorkflow",
      actorArgIndex: 4,
      reasonArgIndex: 5
    }
  ];
  for (const spec of callSpecs) {
    const code = readFileSync(spec.file, "utf8");
    assertPolicy(
      `${relative(process.cwd(), spec.file)} must propagate body.actor/body.reason`,
      hasRequiredCallShape(code, spec)
    );
  }

  const opsApiCode = readFileSync(resolve("src/server/ops-api.ts"), "utf8");
  assertPolicy(
    "forkWorkflow must guard request.stepN > maxStep",
    hasForkUpperBoundGuard(opsApiCode)
  );
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("ops-surface policy self-test: PASS");
    return;
  }
  if (arg) {
    throw new Error("usage: scripts/policy-ops-surface.sh [--self-test]");
  }
  runSelfTest();
  runRepoProbe();
  console.log("ops-surface policy: PASS");
}

main();
