import type { Pool } from "pg";
import type { SBXReq, SBXRes } from "../contracts/index";
import { canonicalStringify } from "../lib/hash";

export type SbxRunParams = {
  runId: string;
  stepId: string;
  taskKey: string;
  attempt: number;
  provider: string;
  request: SBXReq;
  response: SBXRes;
};

export class SbxRunConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SbxRunConflictError";
  }
}

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
      `SELECT provider, request, response, err_code FROM app.sbx_runs 
       WHERE run_id = $1 AND step_id = $2 AND task_key = $3 AND attempt = $4`,
      [params.runId, params.stepId, params.taskKey, params.attempt]
    );
    const existing = existingRes.rows[0];
    if (existing) {
      const existingSemantic = canonicalStringify({
        provider: existing.provider,
        request: existing.request,
        response: existing.response
      });
      const incomingSemantic = canonicalStringify({
        provider: params.provider,
        request: params.request,
        response: params.response
      });
      if (existingSemantic !== incomingSemantic) {
        throw new SbxRunConflictError(
          `SBX run divergence in ${params.runId}:${params.stepId}:${params.taskKey}:${params.attempt}`
        );
      }
      if (existing.err_code !== params.response.errCode) {
        throw new SbxRunConflictError(
          `SBX run divergence in ${params.runId}:${params.stepId}:${params.taskKey}:${params.attempt}. errCode mismatch: ${existing.err_code} !== ${params.response.errCode}`
        );
      }
    } else {
      throw new SbxRunConflictError(
        `SBX run conflict in ${params.runId}:${params.stepId}:${params.taskKey}:${params.attempt} but no row found`
      );
    }
  }
}
