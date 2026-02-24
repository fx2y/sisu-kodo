import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertIntent } from "../../src/db/intentRepo";
import { insertRun, insertRunStep } from "../../src/db/runRepo";
import { insertArtifact } from "../../src/db/artifactRepo";
import { assertProofCard } from "../../src/contracts/ui/proof-card.schema";
import { generateReproSnapshot } from "../../src/lib/repro";
import { getConfig } from "../../src/config";

let pool: Pool;
let sysPool: Pool;
let stop: (() => Promise<void>) | undefined;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  const cfg = getConfig();
  sysPool = createPool(cfg.sysDbName);

  await pool.query("TRUNCATE app.runs, app.intents, app.run_steps, app.artifacts CASCADE");

  const workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
  await sysPool.end();
});

describe("Proof + Repro API (Cycle CY4)", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}/api`;

  test("GET /api/runs/:wid/proofs returns valid cards", async () => {
    // Seed a run
    const intentId = "it_proof_test";
    await insertIntent(pool, intentId, { goal: "test", inputs: {}, constraints: {} });
    const workflowId = "wf_proof_test";
    const { run } = await insertRun(pool, {
      id: "run_proof_test",
      intent_id: intentId,
      intent_hash: "hash123",
      workflow_id: workflowId,
      status: "succeeded"
    });

    await insertRunStep(pool, run.id, {
      stepId: "Step1",
      phase: "SUCCESS",
      output: { attempt: 1 },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString()
    });

    await insertArtifact(pool, run.id, "Step1", 1, {
      kind: "text",
      uri: "art://1",
      sha256: "sha"
    });

    const res = await fetch(`${baseUrl}/runs/${workflowId}/proofs`);
    expect(res.status).toBe(200);
    const cards = (await res.json()) as Array<{ claim: string; provenance: string }>;
    expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBeGreaterThan(0);

    for (const card of cards) {
      assertProofCard(card);
    }

    const identityCard = cards.find((c) => c.claim === "Intent Identity");
    expect(identityCard).toBeDefined();
    expect(identityCard!.provenance).toBe("app.runs.intent_hash");
  });

  test("GET /api/runs/:wid/repro returns valid snapshot and matches lib", async () => {
    const workflowId = "wf_proof_test";
    const res = await fetch(`${baseUrl}/runs/${workflowId}/repro`);
    expect(res.status).toBe(200);
    const apiSnapshot = await res.json();

    const cfg = getConfig();
    const libSnapshot = await generateReproSnapshot(pool, sysPool, workflowId, {
      appDbName: cfg.appDbName,
      sysDbName: cfg.sysDbName
    });

    expect(apiSnapshot.meta.runId).toBe(libSnapshot.meta.runId);
    expect(apiSnapshot.run.id).toBe(libSnapshot.run.id);
    expect(apiSnapshot.runSteps.length).toBe(libSnapshot.runSteps.length);
    expect(apiSnapshot.artifacts.length).toBe(libSnapshot.artifacts.length);
  });

  test("GET /api/runs/:wid/proofs returns [] for unknown run", async () => {
    const res = await fetch(`${baseUrl}/runs/unknown/proofs`);
    expect(res.status).toBe(200);
    const cards = await res.json();
    expect(cards).toEqual([]);
  });

  test("GET /api/runs/:wid/repro 404 for unknown run", async () => {
    const res = await fetch(`${baseUrl}/runs/unknown/repro`);
    expect(res.status).toBe(404);
  });
});
