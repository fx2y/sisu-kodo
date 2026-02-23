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
      await setCandidate(pool, v.id, v.v);
      const ok = await promoteStable(pool, v.id, v.v);
      if (ok) {
        console.log(`Promoted ${v.id}@${v.v}`);
      } else {
        console.log(`Failed to promote ${v.id}@${v.v} (maybe missing evals/fixtures in DB)`);
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
