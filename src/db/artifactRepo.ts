import type { Pool } from "pg";
import type { ArtifactRef } from "../contracts/artifact-ref.schema";

export type ArtifactRow = ArtifactRef & {
  run_id: string;
  step_id: string;
  task_key: string;
  idx: number;
  attempt: number;
  created_at: Date;
};

export async function insertArtifact(
  pool: Pool,
  run_id: string,
  step_id: string,
  idx: number,
  artifact: ArtifactRef,
  task_key: string = "",
  attempt: number = 1
): Promise<ArtifactRow> {
  const { kind, uri, inline, sha256 } = artifact;

  const res = await pool.query(
    `INSERT INTO app.artifacts (run_id, step_id, task_key, idx, attempt, kind, uri, inline, sha256) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
     ON CONFLICT (run_id, step_id, task_key, idx, attempt) DO NOTHING
     RETURNING run_id, step_id, task_key, idx, attempt, kind, uri, inline, sha256, created_at`,
    [
      run_id,
      step_id,
      task_key,
      idx,
      attempt,
      kind,
      uri,
      inline ? JSON.stringify(inline) : null,
      sha256
    ]
  );

  if (res.rowCount === 0) {
    const existingRes = await pool.query(
      `SELECT kind, uri, inline, sha256, created_at FROM app.artifacts 
       WHERE run_id = $1 AND step_id = $2 AND task_key = $3 AND idx = $4 AND attempt = $5`,
      [run_id, step_id, task_key, idx, attempt]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new Error(`Conflict on artifact but record not found`);
    }
    if (existing.sha256 !== sha256 || existing.uri !== uri) {
      throw new Error(
        `Artifact divergence in ${run_id}:${step_id}:${task_key}:${idx}:${attempt}. SHA or URI mismatch.`
      );
    }
    return {
      run_id,
      step_id,
      task_key,
      idx,
      attempt,
      ...existing
    };
  }

  return res.rows[0];
}

export async function findArtifactsByRunId(pool: Pool, run_id: string): Promise<ArtifactRow[]> {
  const res = await pool.query(
    `SELECT run_id, step_id, task_key, idx, attempt, kind, uri, inline, sha256, created_at FROM app.artifacts WHERE run_id = $1 ORDER BY step_id ASC, task_key ASC, idx ASC`,
    [run_id]
  );

  return res.rows;
}

export async function findArtifactByUri(pool: Pool, uri: string): Promise<ArtifactRow | null> {
  const res = await pool.query(
    `SELECT run_id, step_id, task_key, idx, attempt, kind, uri, inline, sha256, created_at 
     FROM app.artifacts WHERE uri = $1 
     ORDER BY attempt DESC LIMIT 1`,
    [uri]
  );

  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return {
    ...row,
    inline: row.inline
      ? typeof row.inline === "string"
        ? JSON.parse(row.inline)
        : row.inline
      : null
  };
}
