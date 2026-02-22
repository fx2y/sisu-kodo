import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Pool } from "pg";
import { closePool, createPool } from "../../src/db/pool";
import { evaluateRun } from "../../src/eval/evaluate-run";
import { insertArtifact } from "../../src/db/artifactRepo";
import type { ArtifactIndex } from "../../src/contracts";
import { sha256 } from "../../src/lib/hash";

describe("eval determinism", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  test("rerun yields stable eval rows", async () => {
    const runId = `run_eval_${Date.now()}`;
    const intentId = `ih_${runId}`;
    await pool.query(
      "INSERT INTO app.intents (id, goal, payload) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING",
      [intentId, "eval-goal", JSON.stringify({ inputs: {}, constraints: {} })]
    );
    await pool.query(
      "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [runId, intentId, intentId, "running"]
    );

    const jsonUri = `artifact://${runId}/ExecuteST/t1/files/out.json`;
    const txtUri = `artifact://${runId}/ExecuteST/t1/files/out.txt`;
    const index: ArtifactIndex = {
      taskKey: "t1",
      provider: "mock",
      items: [
        { kind: "file", uri: jsonUri, sha256: sha256({ ok: true, rows: [1, 2, 3] }) },
        { kind: "file", uri: txtUri, sha256: sha256("alpha beta") }
      ],
      rawRef: "artifact://raw",
      createdAt: "1970-01-01T00:00:00.000Z"
    };
    await insertArtifact(
      pool,
      runId,
      "ExecuteST",
      0,
      {
        kind: "artifact_index",
        uri: `artifact://${runId}/ExecuteST/t1/index.json`,
        inline: { json: index },
        sha256: sha256(index)
      },
      "t1",
      1
    );
    await insertArtifact(
      pool,
      runId,
      "ExecuteST",
      1,
      {
        kind: "file",
        uri: jsonUri,
        inline: { json: { ok: true, rows: [1, 2, 3] } },
        sha256: sha256({ ok: true, rows: [1, 2, 3] })
      },
      "t1",
      1
    );
    await insertArtifact(
      pool,
      runId,
      "ExecuteST",
      2,
      { kind: "file", uri: txtUri, inline: { text: "alpha beta" }, sha256: sha256("alpha beta") },
      "t1",
      1
    );

    const checks = [
      { id: "c0", kind: "file_exists", glob: `artifact://${runId}/*` },
      {
        id: "c1",
        kind: "jsonschema",
        artifact: jsonUri,
        schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
      },
      { id: "c2", kind: "rowcount_gte", artifact: jsonUri, n: 1 },
      { id: "c3", kind: "regex", artifact: txtUri, re: "alpha" },
      { id: "c4", kind: "diff_le", artifactA: txtUri, artifactB: txtUri, max: 0 }
    ] as const;

    const first = await evaluateRun(pool, runId, checks);
    const second = await evaluateRun(pool, runId, checks);
    expect(first.map((x) => [x.check_id, x.pass, x.reason])).toEqual(
      second.map((x) => [x.check_id, x.pass, x.reason])
    );

    const cnt = await pool.query(
      "SELECT count(*)::int AS n FROM app.eval_results WHERE run_id = $1",
      [runId]
    );
    expect(cnt.rows[0].n).toBe(checks.length);
  });
});
