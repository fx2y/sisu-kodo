import { Pool } from "pg";

const runId = process.argv[2];
if (!runId) {
  throw new Error("run id required");
}

const host = process.env.DB_HOST ?? "127.0.0.1";
const port = Number(process.env.DB_PORT ?? "54329");
const user = process.env.DB_USER ?? "postgres";
const password = process.env.DB_PASSWORD ?? "postgres";
const database = process.env.APP_DB_NAME ?? "app_local";

const pool = new Pool({ host, port, user, password, database });

const deadline = globalThis.setTimeout(() => {
  throw new Error("timeout waiting for marks");
}, 30000);

async function main(): Promise<void> {
  for (;;) {
    const res = await pool.query<{ step: string; c: string }>(
      `SELECT step, COUNT(*)::text AS c FROM app.marks WHERE run_id = $1 GROUP BY step`,
      [runId]
    );

    const counts = { s1: 0, s2: 0 };
    for (const row of res.rows) {
      if (row.step === "s1") counts.s1 = Number(row.c);
      if (row.step === "s2") counts.s2 = Number(row.c);
    }

    if (counts.s1 === 1 && counts.s2 === 1) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

main()
  .finally(async () => {
    clearTimeout(deadline);
    await pool.end();
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
