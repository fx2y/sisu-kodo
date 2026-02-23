import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const ASSERT_CALLS = new Set([
  "assertValid",
  "assertIntent",
  "assertRunRequest",
  "assertRunView",
  "assertArtifactRef",
  "assertOCOutput"
]);

function assertProbe(label: string, condition: boolean): void {
  if (!condition) {
    throw new Error(`assert-valid-density self-test failed: ${label}`);
  }
}

function collectAssertCalls(sourceText: string, fileName = "inline.ts"): number {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  let count = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && ASSERT_CALLS.has(expr.text)) {
        count += 1;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return count;
}

function selfTest(): void {
  const good = `
    import { assertRunRequest } from "../src/contracts/run-request.schema";
    const req = { recipeRef: "r@1", formData: {} };
    assertRunRequest(req);
  `;
  const bad = `
    import { parseJsonBody } from "../src/server/json-body";
    parseJsonBody("{}");
  `;

  assertProbe("good fixture should contain assert call", collectAssertCalls(good) === 1);
  assertProbe("bad fixture should contain zero assert calls", collectAssertCalls(bad) === 0);
}

function repoProbe(): void {
  const configPath = resolve(process.cwd(), "tsconfig.json");
  const configText = readFileSync(configPath, "utf8");
  const parsedConfig = ts.parseConfigFileTextToJson(configPath, configText);
  if (parsedConfig.error) {
    throw new Error("failed to parse tsconfig.json for assert-valid-density policy");
  }
  const config = ts.parseJsonConfigFileContent(parsedConfig.config, ts.sys, process.cwd());

  const srcFiles = config.fileNames.filter(
    (fileName) =>
      fileName.includes("/src/") &&
      fileName.endsWith(".ts") &&
      !fileName.includes("/test/") &&
      !fileName.endsWith(".d.ts")
  );

  let count = 0;
  for (const filePath of srcFiles) {
    const text = readFileSync(filePath, "utf8");
    count += collectAssertCalls(text, filePath);
  }

  const threshold = 10;
  if (count < threshold) {
    throw new Error(`Too few boundary gates found (${count}). Minimum ${threshold} required.`);
  }

  console.log(`Ajv boundary gate density: ${count} calls found in src/`);
  console.log("Policy: Ajv gate density OK.");
}

function main() {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    selfTest();
    console.log("assert-valid-density policy self-test: PASS");
    return;
  }
  if (arg !== undefined) {
    throw new Error("usage: scripts/policy-assert-valid-density.sh [--self-test]");
  }
  repoProbe();
}

main();
