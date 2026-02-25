import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

describe("Spec11 Scenario Matrix (GP81)", () => {
  it("executes all S00-S15 scenarios and reports full PASS", () => {
    // We run the matrix script which runs all sub-scenarios
    // This is the "oracle of oracles" for Spec11 coverage.
    const scriptPath = path.join(process.cwd(), "scripts", "scenario-matrix.ts");
    const outPath = path.join(process.cwd(), ".tmp", "scenario-matrix.json");

    // Clean old results
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }

    try {
      execSync(`pnpm exec tsx ${scriptPath}`, {
        stdio: "inherit",
        env: { ...process.env, CI: "1" }
      });
    } catch (_err) {
      // If some scenarios fail, the script exits with 1
      // We still want to read the JSON to see what failed if it wrote it
    }

    expect(fs.existsSync(outPath), "scenario-matrix.json should be generated").toBe(true);
    const results = JSON.parse(fs.readFileSync(outPath, "utf-8"));

    const failed = results.filter((r: { status: string }) => r.status !== "PASS");
    if (failed.length > 0) {
      const failList = failed
        .map((f: { id: string; name: string }) => `${f.id}: ${f.name}`)
        .join("\n");
      throw new Error(`Scenario Matrix Failed:\n${failList}`);
    }

    expect(results.length).toBeGreaterThanOrEqual(16); // S00..S15
    results.forEach((r: { id: string; proofRefs: string[] }) => {
      expect(r.proofRefs, `Scenario ${r.id} must have proofRefs`).toBeDefined();
      expect(r.proofRefs.length).toBeGreaterThan(0);
    });
  });
});
