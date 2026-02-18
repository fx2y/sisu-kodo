import type { Pool } from "pg";
import type { ArtifactRef } from "../contracts/artifact-ref.schema";

export type ArtifactRow = ArtifactRef & {
  run_id: string;
  step_id: string;
  idx: number;
  created_at: Date;
};

export async function insertArtifact(
  pool: Pool,
  run_id: string,
  step_id: string,
  idx: number,
  artifact: ArtifactRef
): Promise<ArtifactRow> {
  const { kind, uri, inline, sha256 } = artifact;

  const res = await pool.query(
    `INSERT INTO app.artifacts (run_id, step_id, idx, kind, uri, inline, sha256) 
     VALUES ($1, $2, $3, $4, $5, $6, $7) 
     ON CONFLICT (run_id, step_id, idx) DO UPDATE SET
       kind = EXCLUDED.kind,
       uri = EXCLUDED.uri,
       inline = EXCLUDED.inline,
       sha256 = EXCLUDED.sha256
     RETURNING run_id, step_id, idx, kind, uri, inline, sha256, created_at`,
    [run_id, step_id, idx, kind, uri, inline ? JSON.stringify(inline) : null, sha256]
  );

  return res.rows[0];
}

export async function findArtifactsByRunId(pool: Pool, run_id: string): Promise<ArtifactRef[]> {
  const res = await pool.query(
    `SELECT kind, uri, inline, sha256 FROM app.artifacts WHERE run_id = $1 ORDER BY step_id ASC, idx ASC`,
    [run_id]
  );

  return res.rows;
}
