import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

function assertPolicy(label: string, condition: boolean): void {
  if (!condition) {
    throw new Error(`stable-recipe-needs-eval-fixtures policy failure: ${label}`);
  }
}

function parseSource(code: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function isIdentifierNumberCompare(
  node: ts.Expression,
  identifier: "evalCount" | "fixtureCount"
): boolean {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.LessThanToken &&
    ts.isIdentifier(node.left) &&
    node.left.text === identifier &&
    ts.isNumericLiteral(node.right) &&
    node.right.text === "1"
  );
}

function hasEvalFixtureGuardCondition(node: ts.Expression): boolean {
  if (!ts.isBinaryExpression(node)) return false;
  if (node.operatorToken.kind !== ts.SyntaxKind.BarBarToken) return false;
  const leftEval = isIdentifierNumberCompare(node.left, "evalCount");
  const rightFixture = isIdentifierNumberCompare(node.right, "fixtureCount");
  const leftFixture = isIdentifierNumberCompare(node.left, "fixtureCount");
  const rightEval = isIdentifierNumberCompare(node.right, "evalCount");
  return (leftEval && rightFixture) || (leftFixture && rightEval);
}

function hasStablePromotionGuard(code: string): boolean {
  const source = parseSource(code, "recipeRepo.ts");
  let found = false;
  walk(source, (node) => {
    if (!ts.isIfStatement(node)) return;
    if (hasEvalFixtureGuardCondition(node.expression)) {
      found = true;
    }
  });
  return found;
}

function hasCoverageQuerySignals(code: string): boolean {
  return code.includes("jsonb_array_length(") && code.includes("fixture_count");
}

function runSelfTest(): void {
  const good = `
    const evalCount = 0;
    const fixtureCount = 0;
    if (evalCount < 1 || fixtureCount < 1) return false;
  `;
  const bad = `
    const evalCount = 0;
    if (evalCount < 1) return false;
  `;
  assertPolicy("self-test good guard", hasStablePromotionGuard(good));
  assertPolicy("self-test bad guard", !hasStablePromotionGuard(bad));
  assertPolicy(
    "self-test query signal positive",
    hasCoverageQuerySignals("jsonb_array_length(x) fixture_count")
  );
  assertPolicy("self-test query signal negative", !hasCoverageQuerySignals("select 1"));
}

function runRepoProbe(): void {
  const filePath = resolve("src/db/recipeRepo.ts");
  const code = readFileSync(filePath, "utf8");
  assertPolicy(
    "promoteStable must require evalCount < 1 || fixtureCount < 1 guard",
    hasStablePromotionGuard(code)
  );
  assertPolicy(
    "promoteStable coverage query must include eval+fixture signals",
    hasCoverageQuerySignals(code)
  );
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("stable-recipe-needs-eval-fixtures policy self-test: PASS");
    return;
  }
  if (arg) {
    throw new Error("usage: scripts/policy-stable-recipe-needs-eval-fixtures.sh [--self-test]");
  }
  runSelfTest();
  runRepoProbe();
  console.log("stable-recipe-needs-eval-fixtures policy: PASS");
}

main();
