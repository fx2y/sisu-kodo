import { createPool } from "../src/db/pool";
import { importBundle, promoteStable, setCandidate } from "../src/db/recipeRepo";
import { readFileSync } from "fs";

async function run() {
  const pool = createPool();
  try {
    const bundleStr = readFileSync("./fixtures/seed-pack/bundle.v1.json", "utf-8");
    const bundle = JSON.parse(bundleStr);
    console.log(`Importing bundle ${bundle.id}...`);
    await importBundle(pool, bundle);

    for (const v of bundle.versions) {
      console.log(`Promoting ${v.id}@${v.v} to stable...`);
      const candidateOk = await setCandidate(pool, v.id, v.v);
      if (!candidateOk) {
        console.log(
          `Failed to set candidate for ${v.id}@${v.v} (maybe already stable or missing?)`
        );
      }
      const ok = await promoteStable(pool, v.id, v.v);
      if (ok) {
        console.log(`Promoted ${v.id}@${v.v}`);
      } else {
        const coverage = await pool.query(
          `SELECT json->'eval' as evals FROM app.recipe_versions WHERE id=$1 AND v=$2`,
          [v.id, v.v]
        );
        const fixtures = await pool.query(
          `SELECT count(*) FROM app.recipe_fixtures WHERE recipe_id=$1 AND v=$2`,
          [v.id, v.v]
        );
        console.log(
          `Failed to promote ${v.id}@${v.v}. Coverage: evals=${JSON.stringify(coverage.rows[0]?.evals || [])}, fixtures=${fixtures.rows[0].count}`
        );
      }
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
