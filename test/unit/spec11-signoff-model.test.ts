import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSignoffBoardService } from "../../src/server/signoff-api";
import * as fs from "node:fs/promises";

import type { Pool } from "pg";

vi.mock("node:fs/promises");
vi.mock("../../src/config", () => ({
  getConfig: () => ({
    workflowRuntimeMode: "api-shim",
    ocMode: "replay",
    sbxMode: "mock",
    sbxProvider: "e2b",
    appVersion: "v1",
    claimScope: "signoff"
  })
}));

describe("Signoff Model Service", () => {
  let mockAppPool: { query: ReturnType<typeof vi.fn> };
  let mockSysPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    mockAppPool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM app.artifacts")) return { rows: [{ count: "0", latest_ts: 0 }] };
        if (sql.includes("FROM app.mock_receipts")) return { rows: [{ count: "0", latest_ts: 0 }] };
        if (sql.includes("FROM app.human_interactions"))
          return { rows: [{ count: "0", latest_ts: 0 }] };
        if (sql.includes("FROM app.runs")) return { rows: [] };
        return { rows: [{ count: "0" }] };
      })
    };
    mockSysPool = {
      query: vi.fn(async () => ({ rows: [] }))
    };
  });

  const mockSuccessfulRead = async (path: string) => {
    const name = path.split("/").pop()?.replace(".json", "") || "test";
    return JSON.stringify({
      id: name,
      label: name.toUpperCase(),
      verdict: "GO",
      evidenceRefs: [`file:${name}.json`, `proof:${name}`],
      ts: 1700000000000,
      appVersion: "v1"
    });
  };

  it("returns NO_GO if files are missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await getSignoffBoardService(
      mockAppPool as unknown as Pool,
      mockSysPool as unknown as Pool
    );

    expect(res.verdict).toBe("NO_GO");
    expect(res.pfTiles.find((t) => t.id === "pf-quick")?.verdict).toBe("NO_GO");
  });

  it("returns GO if all files exist and are GO and no triggers", async () => {
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as unknown as typeof fs.readFile);

    const res = await getSignoffBoardService(
      mockAppPool as unknown as Pool,
      mockSysPool as unknown as Pool
    );

    expect(res.verdict).toBe("GO");
    expect(res.pfTiles.every((t) => t.verdict === "GO")).toBe(true);
    expect(res.rollbackTriggers.every((t) => t.verdict === "GO")).toBe(true);
  });

  it("returns NO_GO if there are budget violations", async () => {
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as unknown as typeof fs.readFile);
    mockAppPool.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM app.artifacts"))
        return { rows: [{ count: "1", latest_ts: 1700000001000 }] };
      if (sql.includes("FROM app.mock_receipts")) return { rows: [{ count: "0", latest_ts: 0 }] };
      if (sql.includes("FROM app.human_interactions"))
        return { rows: [{ count: "0", latest_ts: 0 }] };
      if (sql.includes("FROM app.runs")) return { rows: [] };
      return { rows: [{ count: "0" }] };
    });

    const res = await getSignoffBoardService(
      mockAppPool as unknown as Pool,
      mockSysPool as unknown as Pool
    );

    expect(res.verdict).toBe("NO_GO");
    expect(res.rollbackTriggers.find((t) => t.id === "trigger-budget")?.verdict).toBe("NO_GO");
  });

  it("enforces binary verdict: any NO_GO tile results in overall NO_GO", async () => {
    vi.mocked(fs.readFile).mockImplementation((async (path: string) => {
      const name = path.split("/").pop()?.replace(".json", "") || "test";
      const verdict = name === "pf-quick" ? "NO_GO" : "GO";
      return JSON.stringify({
        id: name,
        label: name.toUpperCase(),
        verdict,
        evidenceRefs: [`proof:${name}`],
        ts: 1700000000001
      });
    }) as unknown as typeof fs.readFile);

    const res = await getSignoffBoardService(
      mockAppPool as unknown as Pool,
      mockSysPool as unknown as Pool
    );
    expect(res.verdict).toBe("NO_GO");
    expect(res.pfTiles.find((t) => t.id === "pf-quick")?.verdict).toBe("NO_GO");
    expect(res.pfTiles.find((t) => t.id === "pf-check")?.verdict).toBe("GO");
  });

  it("includes all mandatory PF tiles", async () => {
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as unknown as typeof fs.readFile);

    const res = await getSignoffBoardService(
      mockAppPool as unknown as Pool,
      mockSysPool as unknown as Pool
    );
    const expectedPf = ["quick", "check", "full", "deps", "policy", "crashdemo"];
    const actualPf = res.pfTiles.map((t) => t.id.replace("pf-", ""));

    expect(actualPf).toEqual(expect.arrayContaining(expectedPf));
    expect(res.pfTiles.length).toBe(expectedPf.length);
  });

  it("includes all mandatory Proof tiles", async () => {
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as unknown as typeof fs.readFile);

    const res = await getSignoffBoardService(
      mockAppPool as unknown as Pool,
      mockSysPool as unknown as Pool
    );
    const expectedProof = [
      "api-run-idem",
      "api-run-drift",
      "malformed-400",
      "x1-audit",
      "split-parity",
      "hitl-dedupe",
      "queue-fairness",
      "budget-guard"
    ];
    const actualProof = res.proofTiles.map((t) => t.id.replace("proof-", ""));

    expect(actualProof).toEqual(expect.arrayContaining(expectedProof));
  });

  it("queries DBOS divergence via sysPool using workflow_uuid", async () => {
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as unknown as typeof fs.readFile);
    mockAppPool.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM app.artifacts")) return { rows: [{ count: "0", latest_ts: 0 }] };
      if (sql.includes("FROM app.mock_receipts")) return { rows: [{ count: "0", latest_ts: 0 }] };
      if (sql.includes("FROM app.human_interactions"))
        return { rows: [{ count: "0", latest_ts: 0 }] };
      if (sql.includes("FROM app.runs")) {
        return { rows: [{ workflow_id: "wid_1", updated_ts: 1700000000000 }] };
      }
      return { rows: [] };
    });
    mockSysPool.query.mockResolvedValue({
      rows: [{ workflow_uuid: "wid_1", status: "SUCCESS" }]
    });

    await getSignoffBoardService(mockAppPool as unknown as Pool, mockSysPool as unknown as Pool);

    expect(mockSysPool.query).toHaveBeenCalledTimes(1);
    const [sql] = mockSysPool.query.mock.calls[0] ?? [];
    expect(String(sql)).toContain("dbos.workflow_status");
    expect(String(sql)).toContain("workflow_uuid");
    expect(
      mockAppPool.query.mock.calls.some(([q]) => String(q).includes("JOIN dbos.workflow_status"))
    ).toBe(false);
  });

  it("fails closed when mandatory GO tiles omit evidence refs and activates false-green trigger", async () => {
    vi.mocked(fs.readFile).mockImplementation((async (path: string) => {
      const name = path.split("/").pop()?.replace(".json", "") || "test";
      return JSON.stringify({
        id: name,
        label: name.toUpperCase(),
        verdict: "GO",
        evidenceRefs: [],
        ts: 1700000000000
      });
    }) as unknown as typeof fs.readFile);

    const res = await getSignoffBoardService(
      mockAppPool as unknown as Pool,
      mockSysPool as unknown as Pool
    );

    expect(res.verdict).toBe("NO_GO");
    expect(res.pfTiles.every((tile) => tile.evidenceRefs.length > 0)).toBe(true);
    expect(res.proofTiles.every((tile) => tile.evidenceRefs.length > 0)).toBe(true);
    expect(res.pfTiles[0]?.verdict).toBe("NO_GO");
    expect(res.rollbackTriggers.find((t) => t.id === "trigger-false-green")).toEqual(
      expect.objectContaining({
        verdict: "NO_GO",
        evidenceRefs: expect.arrayContaining(["policy:signoff:mandatory-evidence"])
      })
    );
  });

  it("uses semantic x1 checks instead of raw run_steps retry counts", async () => {
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as unknown as typeof fs.readFile);

    await getSignoffBoardService(mockAppPool as unknown as Pool, mockSysPool as unknown as Pool);

    const sqls = mockAppPool.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes("FROM app.run_steps"))).toBe(false);
    expect(sqls.some((sql) => sql.includes("FROM app.mock_receipts"))).toBe(true);
    expect(sqls.some((sql) => sql.includes("FROM app.human_interactions"))).toBe(true);
  });

  it("fails GO when appVersion mismatches (T28)", async () => {
    vi.mocked(fs.readFile).mockImplementation((async (path: string) => {
      const name = path.split("/").pop()?.replace(".json", "") || "test";
      return JSON.stringify({
        id: name,
        label: name.toUpperCase(),
        verdict: "GO",
        evidenceRefs: [`proof:${name}`],
        ts: 1700000000000,
        appVersion: "v2" // Mismatch (config says v1)
      });
    }) as unknown as typeof fs.readFile);

    const res = await getSignoffBoardService(
      mockAppPool as unknown as Pool,
      mockSysPool as unknown as Pool
    );

    expect(res.verdict).toBe("NO_GO");
    const tile = res.pfTiles.find((t) => t.id === "pf-quick");
    expect(tile?.verdict).toBe("NO_GO");
    expect(tile?.reason).toContain("app_version_mismatch");
  });

  it("fails GO when commit/tree mismatches (T28)", async () => {
    process.env.SIGNOFF_COMMIT = "commit-a";
    try {
      vi.mocked(fs.readFile).mockImplementation((async (path: string) => {
        const name = path.split("/").pop()?.replace(".json", "") || "test";
        return JSON.stringify({
          id: name,
          label: name.toUpperCase(),
          verdict: "GO",
          evidenceRefs: [`proof:${name}`],
          ts: 1700000000000,
          appVersion: "v1",
          commit: "commit-b" // Mismatch
        });
      }) as unknown as typeof fs.readFile);

      const res = await getSignoffBoardService(
        mockAppPool as unknown as Pool,
        mockSysPool as unknown as Pool
      );

      expect(res.verdict).toBe("NO_GO");
      expect(res.pfTiles[0]?.reason).toContain("commit_mismatch");
    } finally {
      delete process.env.SIGNOFF_COMMIT;
    }
  });
});
