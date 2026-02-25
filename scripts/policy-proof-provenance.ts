import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

function assertPolicy(label: string, condition: boolean): void {
  if (!condition) {
    throw new Error(`proof-provenance policy failure: ${label}`);
  }
}

function hasUnlabeledProofCard(code: string): boolean {
  const marker = "cards.push(";
  let pos = 0;
  while ((pos = code.indexOf(marker, pos)) !== -1) {
    const start = pos + marker.length;
    // Find the matching closing parenthesis for cards.push(...)
    let parenCount = 1;
    let end = -1;
    let inString: string | null = null;

    for (let i = start; i < code.length; i++) {
      const char = code[i];

      if (inString) {
        if (char === "\\") {
          i++;
          continue;
        }
        if (char === inString) {
          inString = null;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        inString = char;
        continue;
      }

      if (char === "(") parenCount++;
      if (char === ")") {
        parenCount--;
        if (parenCount === 0) {
          end = i;
          break;
        }
      }
    }

    if (end !== -1) {
      const body = code.substring(start, end);
      // Check if this looks like a ProofCard object (has id, claim, evidence, source, ts, provenance)
      if (body.includes("claim:") && body.includes("evidence:")) {
        // Must have id
        if (!body.includes("id:")) return true;
        // Must have provenance
        const provMatch = body.match(/provenance\s*:\s*["'`]([\s\S]*?)["'`]/);
        if (!provMatch || provMatch[1].trim() === "") return true;

        // Must have lowercase source from enum
        const sourceMatch = body.match(/source\s*:\s*["'`]([\s\S]*?)["'`]/);
        if (!sourceMatch) return true;
        const validSources = ["sql", "api", "dbos", "artifact", "k6", "policy", "test"];
        if (!validSources.includes(sourceMatch[1].trim())) return true;
      }
    }
    pos += marker.length;
  }
  return false;
}

function runSelfTest(): void {
  const good = `
    cards.push({
      id: "p1",
      claim: "Status",
      evidence: "SUCCESS",
      source: "sql",
      ts: Date.now(),
      provenance: "app.runs.status"
    });
  `;
  const badMissingId = `
    cards.push({
      claim: "Status",
      evidence: "SUCCESS",
      source: "sql",
      ts: Date.now(),
      provenance: "app.runs.status"
    });
  `;
  const badSourceCaps = `
    cards.push({
      id: "p1",
      claim: "Status",
      evidence: "SUCCESS",
      source: "SQL",
      ts: Date.now(),
      provenance: "app.runs.status"
    });
  `;
  const badEmptyProv = `
    cards.push({
      id: "p1",
      claim: "Status",
      evidence: "SUCCESS",
      source: "sql",
      ts: Date.now(),
      provenance: ""
    });
  `;
  assertPolicy("good fixture should pass", !hasUnlabeledProofCard(good));
  assertPolicy("bad fixture (missing id) should fail", hasUnlabeledProofCard(badMissingId));
  assertPolicy("bad fixture (source caps) should fail", hasUnlabeledProofCard(badSourceCaps));
  assertPolicy("bad fixture (empty prov) should fail", hasUnlabeledProofCard(badEmptyProv));
}

function walk(dir: string, callback: (path: string) => void) {
  for (const file of readdirSync(dir)) {
    const path = join(dir, file);
    if (statSync(path).isDirectory()) {
      if (file !== "node_modules" && file !== ".next" && file !== "dist") {
        walk(path, callback);
      }
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      callback(path);
    }
  }
}

function runRepoProbe(): void {
  const offenders: string[] = [];
  walk(resolve("src"), (path) => {
    const code = readFileSync(path, "utf8");
    if (hasUnlabeledProofCard(code)) {
      offenders.push(path);
    }
  });
  assertPolicy(
    `Proof cards without labeled provenance found in:\n${offenders.join("\n")}`,
    offenders.length === 0
  );
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    runSelfTest();
    console.log("proof-provenance policy self-test: PASS");
    return;
  }
  runSelfTest();
  runRepoProbe();
  console.log("proof-provenance policy: PASS");
}

main();
