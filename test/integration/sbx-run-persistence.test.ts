import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertIntent } from "../../src/db/intentRepo";
import { insertSbxRun } from "../../src/db/sbxRunRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { assertSBXReq, assertSBXRes, type SBXRes } from "../../src/contracts";
import { generateId } from "../../src/lib/id";
import { OCMockDaemon } from "../oc-mock-daemon";

let pool: Pool;
let workflow: DBOSWorkflowEngine;
let oc: OCMockDaemon;
const daemonPort = 4101;

beforeAll(async () => {
  oc = new OCMockDaemon(daemonPort);
  await oc.start();
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";
  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(20);
});

afterAll(async () => {
  await DBOS.shutdown();
  if (oc) await oc.stop();
  await pool.end();
  await closePool();
});

describe("SBX run persistence", () => {
  test(
    "persists sbx_runs row before step returns and handles idempotency",
    { timeout: 30000 },
    async () => {
      const intentId = generateId("it_sbx_persist");
      await insertIntent(pool, intentId, {
        goal: "simple run",
        inputs: {},
        constraints: {}
      });

      const { runId } = await startIntentRun(pool, workflow, intentId, {
        queuePartitionKey: "test-partition"
      });
      await approvePlan(pool, runId, "test-user");

      await workflow.waitUntilComplete(intentId, 15000);

      const sbxRuns = await pool.query<{
        task_key: string;
        provider: string;
        err_code: string;
        request: unknown;
        response: unknown;
        created_at: Date;
      }>(
        `SELECT task_key, provider, err_code, request, response, created_at
       FROM app.sbx_runs
       WHERE run_id = $1 AND step_id = 'ExecuteST'`,
        [runId]
      );

      expect(sbxRuns.rowCount).toBeGreaterThan(0);
      const sbxRow = sbxRuns.rows[0];
      const taskKey = sbxRow.task_key;
      expect(taskKey).toMatch(/^[0-9a-f]{64}$/);
      expect(sbxRow.err_code).toBe("NONE");

      assertSBXReq(sbxRow.request);
      assertSBXRes(sbxRow.response);

      const runStep = await pool.query<{ finished_at: Date }>(
        "SELECT finished_at FROM app.run_steps WHERE run_id = $1 AND step_id = 'ExecuteST'",
        [runId]
      );
      expect(runStep.rowCount).toBe(1);
      const finishedAt = runStep.rows[0]?.finished_at;
      expect(finishedAt).toBeDefined();
      if (!finishedAt) {
        throw new Error("missing ExecuteST finished_at");
      }
      expect(sbxRow.created_at.getTime()).toBeLessThanOrEqual(finishedAt.getTime());

      // 2. Same PK but drifted payload must fail-closed.
      await expect(
        insertSbxRun(pool, {
          runId,
          stepId: "ExecuteST",
          taskKey,
          attempt: 1,
          provider: "local-process",
          request: sbxRow.request,
          response: {
            ...(sbxRow.response as SBXRes),
            stdout: "UPDATED\n"
          }
        })
      ).rejects.toThrow(/SBX run divergence/);

      // 2b. Identical duplicate is idempotent success.
      await insertSbxRun(pool, {
        runId,
        stepId: "ExecuteST",
        taskKey,
        attempt: 1,
        provider: sbxRow.provider,
        request: sbxRow.request,
        response: sbxRow.response as SBXRes
      });

      const afterUpsert = await pool.query<{ count: number; stdout: string }>(
        `SELECT 
         COUNT(*)::int AS count,
         MAX(response ->> 'stdout') AS stdout
       FROM app.sbx_runs 
       WHERE run_id = $1 AND step_id = 'ExecuteST' AND task_key = $2 AND attempt = 1`,
        [runId, taskKey]
      );
      // Should NOT be updated
      expect(afterUpsert.rows[0]?.stdout).not.toBe("UPDATED\n");

      // 3. New attempt should append
      await insertSbxRun(pool, {
        runId,
        stepId: "ExecuteST",
        taskKey,
        attempt: 2,
        provider: sbxRow.provider,
        request: sbxRow.request,
        response: {
          ...(sbxRow.response as SBXRes),
          stdout: "ATTEMPT 2\n"
        }
      });

      const withAttempt2 = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM app.sbx_runs 
       WHERE run_id = $1 AND step_id = 'ExecuteST' AND task_key = $2`,
        [runId, taskKey]
      );
      expect(withAttempt2.rows[0]?.count).toBe(2);

      // Verify artifacts were also persisted
      const artifacts = await pool.query<{ kind: string; uri: string | null }>(
        "SELECT kind, uri FROM app.artifacts WHERE run_id = $1 AND step_id = 'ExecuteST'",
        [runId]
      );
      expect(artifacts.rowCount).toBeGreaterThan(0);
      const stdoutLog = artifacts.rows.find((a) => a.uri?.endsWith("stdout.log"));
      expect(stdoutLog).toBeDefined();

      const taskFile = artifacts.rows.find((a) => a.uri?.includes(`/task/${taskKey}/`));
      expect(taskFile).toBeDefined();

      const nonHexDigests = await pool.query<{ sha256: string }>(
        `SELECT sha256 FROM app.artifacts
       WHERE run_id = $1
       AND sha256 !~ '^[0-9a-f]{64}$'`,
        [runId]
      );
      expect(nonHexDigests.rowCount).toBe(0);
    }
  );
});
