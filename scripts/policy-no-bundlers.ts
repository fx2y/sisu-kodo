import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import ts from "typescript";

const BANNED_PACKAGES = new Set(["esbuild", "webpack", "rollup", "vite", "parcel"]);
const ALLOWED_IMPORTS = new Set(["vitest/config"]);

function assertPolicy(label: string, condition: boolean): void {
  if (!condition) {
    throw new Error(`no-bundlers policy failure: ${label}`);
  }
}

function listSourceFiles(rootDir: string): string[] {
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
      const ext = extname(full);
      if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".mjs" || ext === ".cjs") {
        out.push(full);
      }
    }
  }
  return out;
}

function parseSource(code: string, fileName: string): ts.SourceFile {
  const scriptKind =
    extname(fileName) === ".tsx"
      ? ts.ScriptKind.TSX
      : extname(fileName) === ".js"
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, scriptKind);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function rootPackage(importPath: string): string {
  if (importPath.startsWith("@")) {
    const [scope, name] = importPath.split("/");
    return scope && name ? `${scope}/${name}` : importPath;
  }
  return importPath.split("/")[0] ?? importPath;
}

function findBannedImports(code: string, fileName: string): string[] {
  const source = parseSource(code, fileName);
  const violations: string[] = [];
  walk(source, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      if (ALLOWED_IMPORTS.has(moduleName)) return;
      const pkg = rootPackage(moduleName);
      if (BANNED_PACKAGES.has(pkg)) {
        violations.push(moduleName);
      }
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const moduleName = node.arguments[0].text;
      if (ALLOWED_IMPORTS.has(moduleName)) return;
      const pkg = rootPackage(moduleName);
      if (BANNED_PACKAGES.has(pkg)) {
        violations.push(moduleName);
      }
    }
  });
  return violations;
}

function findBannedPackageJsonDeps(): string[] {
  const pkgJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = Object.keys(pkgJson.dependencies ?? {});
  const devDeps = Object.keys(pkgJson.devDependencies ?? {});
  return [...deps, ...devDeps].filter((dep) => BANNED_PACKAGES.has(dep)).sort();
}

function runSelfTest(): void {
  const good = `
    import { defineConfig } from "vitest/config";
    export default defineConfig({});
  `;
  const bad = `
    import * as esbuild from "esbuild";
    const webpack = require("webpack");
    export { esbuild, webpack };
  `;
  assertPolicy(
    "good fixture should have zero banned imports",
    findBannedImports(good, "good.ts").length === 0
  );
  const badHits = findBannedImports(bad, "bad.ts");
  assertPolicy("bad fixture should detect esbuild", badHits.includes("esbuild"));
  assertPolicy("bad fixture should detect webpack", badHits.includes("webpack"));
}

function runRepoProbe(): void {
  const depViolations = findBannedPackageJsonDeps();
  assertPolicy(
    `package.json declares banned bundlers: ${depViolations.join(", ")}`,
    depViolations.length === 0
  );

  const roots = ["src", "app", "scripts"];
  const importViolations: string[] = [];
  for (const root of roots) {
    for (const filePath of listSourceFiles(root)) {
      const code = readFileSync(filePath, "utf8");
      for (const hit of findBannedImports(code, filePath)) {
        importViolations.push(`${filePath}:${hit}`);
      }
    }
  }
  assertPolicy(
    `source imports banned bundlers:\n${importViolations.join("\n")}`,
    importViolations.length === 0
  );
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("no-bundlers policy self-test: PASS");
    return;
  }
  if (arg) {
    throw new Error("usage: scripts/policy-no-bundlers.sh [--self-test]");
  }
  runSelfTest();
  runRepoProbe();
  console.log("no-bundlers policy: PASS");
}

main();
