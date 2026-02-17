import { DBOS } from "@dbos-inc/dbos-sdk";
import { getPool } from "../../db/pool";

export class CrashDemoSteps {
  @DBOS.step()
  static async step1(workflowId: string) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO app.marks (run_id, step) VALUES ($1, 's1') ON CONFLICT (run_id, step) DO NOTHING`,
      [workflowId]
    );
  }

  @DBOS.step()
  static async step2(workflowId: string) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO app.marks (run_id, step) VALUES ($1, 's2') ON CONFLICT (run_id, step) DO NOTHING`,
      [workflowId]
    );
  }

  @DBOS.step()
  static async getMarks(workflowId: string) {
    const pool = getPool();
    const result = await pool.query<{ step: string; c: string }>(
      `SELECT step, COUNT(*)::text AS c FROM app.marks WHERE run_id = $1 GROUP BY step`,
      [workflowId]
    );
    const out: Record<string, number> = { s1: 0, s2: 0 };
    for (const row of result.rows) {
      out[row.step] = Number(row.c);
    }
    return out;
  }
}
