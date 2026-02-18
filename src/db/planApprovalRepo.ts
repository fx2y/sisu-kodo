import type { Pool } from "pg";

type PlanApprovalRow = { approvedAt: Date };

export async function approvePlan(
  pool: Pool,
  runId: string,
  approvedBy: string,
  notes?: string
): Promise<Date> {
  const res = await pool.query<PlanApprovalRow>(
    `INSERT INTO app.plan_approvals (run_id, approved_by, notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (run_id) DO UPDATE SET
       approved_at = NOW(),
       approved_by = EXCLUDED.approved_by,
       notes = EXCLUDED.notes
     RETURNING approved_at AS "approvedAt"`,
    [runId, approvedBy, notes]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error(`plan approval upsert failed for run ${runId}`);
  }
  return row.approvedAt;
}

export async function isPlanApproved(pool: Pool, runId: string): Promise<boolean> {
  const res = await pool.query("SELECT 1 FROM app.plan_approvals WHERE run_id = $1", [runId]);
  return res.rowCount !== null && res.rowCount > 0;
}
