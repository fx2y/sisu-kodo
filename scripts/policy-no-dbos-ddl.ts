import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assertPolicy(label: string, condition: boolean): void {
  if (!condition) {
    throw new Error(`no-dbos-ddl policy failure: ${label}`);
  }
}

function stripSqlNoise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .replace(/'([^']|'')*'/g, "''")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCreateTableInDbosSchema(sql: string): boolean {
  const normalized = stripSqlNoise(sql).toLowerCase();
  const re = /\bcreate\s+table\s+(if\s+not\s+exists\s+)?dbos\./g;
  return re.test(normalized);
}

function runSelfTest(): void {
  const good = `
    CREATE TABLE IF NOT EXISTS app.runs (id TEXT PRIMARY KEY);
  `;
  const bad = `
    CREATE TABLE dbos.bad_table (id TEXT);
  `;
  assertPolicy("good fixture should pass", !hasCreateTableInDbosSchema(good));
  assertPolicy("bad fixture should fail", hasCreateTableInDbosSchema(bad));
}

function runRepoProbe(): void {
  const migrationsDir = resolve("db/migrations");
  const offenders: string[] = [];
  for (const fileName of readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const fullPath = resolve(migrationsDir, fileName);
    const sql = readFileSync(fullPath, "utf8");
    if (hasCreateTableInDbosSchema(sql)) {
      offenders.push(fullPath);
    }
  }
  assertPolicy(
    `app migrations create tables in dbos schema:\n${offenders.join("\n")}`,
    offenders.length === 0
  );
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("no-dbos-ddl policy self-test: PASS");
    return;
  }
  if (arg) {
    throw new Error("usage: scripts/policy-no-dbos-ddl.sh [--self-test]");
  }
  runSelfTest();
  runRepoProbe();
  console.log("no-dbos-ddl policy: PASS");
}

main();
