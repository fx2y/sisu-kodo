import { execSync } from "child_process";
import fs from "fs";
import path from "path";

interface ScenarioResult {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  evidence?: string;
  error?: string;
  duration?: number;
  proofRefs: string[];
}

const SCENARIOS: Array<{ id: string; name: string; cmd: string; proofRefs: string[] }> = [
  {
    id: "S00",
    name: "Bootstrap + Claim Scope",
    cmd: "mise run quick",
    proofRefs: ["pf:quick", "cmd:mise run quick"]
  },
  {
    id: "S01",
    name: "Canonical Run Happy Path",
    cmd: "mise run test:integration:mock:file test/integration/api-routes.test.ts",
    proofRefs: ["sql:app.runs#workflow_id_ih", "api:POST/api/run"]
  },
  {
    id: "S02",
    name: "Idempotent Replay + Drift",
    cmd: "mise run test:integration:mock:file test/integration/api-routes.test.ts",
    proofRefs: ["sql:app.runs#idempotency", "api:POST/api/run:409"]
  },
  {
    id: "S03",
    name: "FC Ingress + Zero-Write",
    cmd: "mise run test:integration:mock:file test/integration/intents-db-guard.test.ts",
    proofRefs: ["sql:app.intents#zero_writes", "api:POST/api/run:400"]
  },
  {
    id: "S04",
    name: "HITL Canonical Gate",
    cmd: "mise run test:integration:mock:file test/integration/hitl-correctness-policy.test.ts",
    proofRefs: ["sql:app.human_interactions#x1", "app.artifacts#OPS"]
  },
  {
    id: "S05",
    name: "HITL Chaos Matrix",
    cmd: "mise run test:integration:mock:file test/integration/hitl-correctness-policy.test.ts",
    proofRefs: [
      "sql:app.human_interactions#dedupe_drift",
      "api:POST/api/runs/wid/gates/gate/reply:409"
    ]
  },
  {
    id: "S06",
    name: "External HITL Event",
    cmd: "mise run test:integration:mock:file test/integration/hitl-correctness-policy.test.ts",
    proofRefs: ["sql:app.human_interactions#external_origin", "api:POST/api/events/hitl"]
  },
  {
    id: "S07",
    name: "Ops6 Control",
    cmd: "mise run test:e2e:file test/e2e/ops-controls.test.ts",
    proofRefs: ["sql:app.artifacts#step_id_OPS", "api:POST/api/ops/wf/wid/cancel"]
  },
  {
    id: "S08",
    name: "Repro-Pack + Triage",
    cmd: "mise run test:integration:mock:file test/integration/api-routes.test.ts",
    proofRefs: ["artifact:repro-pack", "scripts/repro-pack.ts"]
  },
  {
    id: "S09",
    name: "Split Topology + Durability",
    cmd: "mise run test:e2e:file test/e2e/api-shim.test.ts",
    proofRefs: ["sql:dbos.workflow_status#queue_name", "healthz:split-topology"]
  },
  {
    id: "S10",
    name: "Queue Fairness + Priority",
    cmd: "mise run test:integration:mock:file test/integration/queue-partition-fairness.test.ts",
    proofRefs: ["sql:dbos.workflow_status#queue_partition_key", "test:priority-latency"]
  },
  {
    id: "S11",
    name: "Budget Guards",
    cmd: "mise run test:integration:mock:file test/integration/spec10-budget-runtime.test.ts",
    proofRefs: ["sql:app.artifacts#step_id_BUDGET", "api:POST/api/run:400:budget"]
  },
  {
    id: "S12",
    name: "Recipe Flywheel",
    cmd: "mise run test:integration:mock:file test/integration/recipe-import-export.test.ts",
    proofRefs: ["sql:app.recipe_versions#status_stable", "api:POST/api/recipes/import"]
  },
  {
    id: "S13",
    name: "Reversible Patch",
    cmd: "mise run test:integration:mock:file test/integration/patch-rollback.test.ts",
    proofRefs: ["sql:app.patch_history", "artifact:patch-apply"]
  },
  {
    id: "S14",
    name: "Live Integrations (Smoke)",
    cmd: "bash -c 'mise run oc:refresh && mise run oc:live:smoke && mise run sbx:live:smoke'",
    proofRefs: ["cmd:oc:live:smoke", "cmd:sbx:live:smoke"]
  },
  {
    id: "S15",
    name: "Binary Signoff (Full)",
    cmd: "mise run full",
    proofRefs: ["pf:full", "api:GET/api/ops/signoff"]
  }
];

async function runScenarios() {
  const targetId = process.argv[2];
  const targetScenarios = targetId ? SCENARIOS.filter((s) => s.id === targetId) : SCENARIOS;

  if (targetScenarios.length === 0) {
    console.error(`Unknown scenario: ${targetId}`);
    process.exit(1);
  }

  const results: ScenarioResult[] = [];
  console.log("Sisu-Kodo Scenario Matrix Runner");
  console.log("===============================");

  for (const s of targetScenarios) {
    const start = Date.now();
    process.stdout.write(`Running ${s.id}: ${s.name}... `);
    try {
      execSync(s.cmd, { stdio: "inherit", env: { ...process.env, CI: "1" } });
      const duration = Date.now() - start;
      console.log(`\n${s.id}: \x1b[32mPASS\x1b[0m`);
      results.push({ id: s.id, name: s.name, status: "PASS", duration, proofRefs: s.proofRefs });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "stderr" in err && err.stderr
          ? (err.stderr as Buffer).toString()
          : err instanceof Error
            ? err.message
            : String(err);
      console.log(`\n${s.id}: \x1b[31mFAIL\x1b[0m`);
      results.push({
        id: s.id,
        name: s.name,
        status: "FAIL",
        error: message,
        duration: Date.now() - start,
        proofRefs: s.proofRefs
      });
      console.error(message);
    }
  }

  const outPath = path.join(process.cwd(), ".tmp", "scenario-matrix.json");
  if (!fs.existsSync(path.dirname(outPath))) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  }
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log("\nSummary Report");
  console.log("--------------");
  let passed = 0;
  results.forEach((r) => {
    if (r.status === "PASS") passed++;
    console.log(`${r.id} | ${r.status.padEnd(4)} | ${r.name}`);
  });
  console.log(`\nOverall: ${passed}/${targetScenarios.length} passed`);

  if (passed < targetScenarios.length) {
    process.exit(1);
  }
}

void runScenarios();
