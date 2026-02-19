import { Pool } from "pg";

async function main() {
  const pool = new Pool({
    host: "127.0.0.1",
    port: 54329,
    user: "postgres",
    password: "postgres",
    database: "app_local"
  });

  try {
    const res = await pool.query(`
      SELECT 'runs' as k, count(*) from app.runs
      UNION ALL
      SELECT 'run_steps', count(*) from app.run_steps
      UNION ALL
      SELECT 'artifacts', count(*) from app.artifacts
      UNION ALL
      SELECT 'mock_receipts', count(*) from app.mock_receipts
    `);
    console.log(JSON.stringify(res.rows));
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
