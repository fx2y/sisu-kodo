import type { Pool } from "pg";
import type { RecipeEvalCheck } from "../contracts/recipe.schema";
import { assertArtifactIndex, assertEvalChecks } from "../contracts";
import { evaluateChecks, type EvalArtifact } from "./runner";
import { saveEvalResults, type EvalResultRow } from "../db/evalRepo";

type ArtifactRow = {
  kind: string;
  uri: string;
  inline: unknown;
};

export async function evaluateRun(
  pool: Pool,
  runId: string,
  checks: readonly RecipeEvalCheck[]
): Promise<EvalResultRow[]> {
  assertEvalChecks(checks);
  const rows = await pool.query<ArtifactRow>(
    `SELECT kind, uri, inline
     FROM app.artifacts
     WHERE run_id = $1
     ORDER BY idx ASC`,
    [runId]
  );

  const indexArtifact = rows.rows.find((row) => row.kind === "artifact_index");
  if (!indexArtifact || !indexArtifact.inline || typeof indexArtifact.inline !== "object") {
    throw new Error(`artifact index missing for run ${runId}`);
  }

  const indexWrapper = indexArtifact.inline as { json?: unknown };
  const index = indexWrapper.json ?? indexArtifact.inline;
  assertArtifactIndex(index);

  const map = new Map<string, EvalArtifact>();
  for (const row of rows.rows) {
    if (!row.uri) continue;
    const payload =
      row.inline &&
      typeof row.inline === "object" &&
      "json" in (row.inline as Record<string, unknown>)
        ? (row.inline as Record<string, unknown>).json
        : row.inline;
    map.set(row.uri, { uri: row.uri, inline: payload, sha256: "" });
  }

  const results = evaluateChecks([...checks], index, map);
  await saveEvalResults(pool, runId, results);
  const stored = await pool.query<EvalResultRow>(
    `SELECT run_id, check_id, pass, reason, payload, created_at
     FROM app.eval_results
     WHERE run_id = $1
     ORDER BY check_id ASC`,
    [runId]
  );
  return stored.rows;
}
