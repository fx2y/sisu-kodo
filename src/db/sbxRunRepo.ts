import type { Pool } from "pg";
import type { SBXReq, SBXRes } from "../contracts/index";

export type SbxRunParams = {
  runId: string;
  stepId: string;
  taskKey: string;
  provider: string;
  request: SBXReq;
  response: SBXRes;
};

/**
 * Upserts an SBX execution record into the database.
 * PK=(run_id, step_id, task_key).
 */
export async function upsertSbxRun(pool: Pool, params: SbxRunParams): Promise<void> {
  await pool.query(
    `INSERT INTO app.sbx_runs (
      run_id, step_id, task_key, provider, request, response, err_code, metrics
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (run_id, step_id, task_key) DO UPDATE SET
      response = EXCLUDED.response,
      err_code = EXCLUDED.err_code,
      metrics = EXCLUDED.metrics,
      updated_at = NOW()`,
    [
      params.runId,
      params.stepId,
      params.taskKey,
      params.provider,
      params.request,
      params.response,
      params.response.errCode,
      params.response.metrics
    ]
  );
}
