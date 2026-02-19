import type { Pool } from "pg";
import type { SBXReq, SBXRes } from "../contracts/index";

export type SbxRunParams = {
  runId: string;
  stepId: string;
  taskKey: string;
  attempt: number;
  provider: string;
  request: SBXReq;
  response: SBXRes;
};

/**
 * Inserts an SBX execution record into the database.
 * PK=(run_id, step_id, task_key, attempt).
 * C7.T5: Switch to DO NOTHING + mismatch assertions.
 */
export async function insertSbxRun(pool: Pool, params: SbxRunParams): Promise<void> {
  const res = await pool.query(
    `INSERT INTO app.sbx_runs (
      run_id, step_id, task_key, attempt, provider, request, response, err_code, metrics
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (run_id, step_id, task_key, attempt) DO NOTHING
    RETURNING run_id`,
    [
      params.runId,
      params.stepId,
      params.taskKey,
      params.attempt,
      params.provider,
      params.request,
      params.response,
      params.response.errCode,
      params.response.metrics
    ]
  );

  if (res.rowCount === 0) {
    const existingRes = await pool.query(
      `SELECT err_code FROM app.sbx_runs 
       WHERE run_id = $1 AND step_id = $2 AND task_key = $3 AND attempt = $4`,
      [params.runId, params.stepId, params.taskKey, params.attempt]
    );
    const existing = existingRes.rows[0];
    if (existing && existing.err_code !== params.response.errCode) {
      throw new Error(
        `SBX run divergence in ${params.runId}:${params.stepId}:${params.taskKey}:${params.attempt}. errCode mismatch: ${existing.err_code} !== ${params.response.errCode}`
      );
    }
  }
}
