import { describe, expect, it, vi } from "vitest";
import { insertRunStep } from "../../src/db/runRepo";

describe("runRepo.insertRunStep", () => {
  it("treats jsonb key-order differences as deterministic equality", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ phase: "compilation", output: { b: 2, a: 1, attempt: 1 } }]
      });
    const pool = { query } as unknown as Parameters<typeof insertRunStep>[0];

    await expect(
      insertRunStep(pool, "run-1", {
        stepId: "CompileST",
        phase: "compilation",
        output: { a: 1, b: 2, attempt: 1 },
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString()
      })
    ).resolves.toBeUndefined();
  });

  it("throws determinism violation on semantic output mismatch", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ phase: "compilation", output: { a: 1, attempt: 1 } }]
      });
    const pool = { query } as unknown as Parameters<typeof insertRunStep>[0];

    await expect(
      insertRunStep(pool, "run-1", {
        stepId: "CompileST",
        phase: "compilation",
        output: { a: 2, attempt: 1 },
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString()
      })
    ).rejects.toThrow("Determinism violation in run-1:CompileST:1");
  });
});
