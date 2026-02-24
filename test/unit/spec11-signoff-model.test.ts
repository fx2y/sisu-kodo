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
  let mockAppPool: unknown;
  let mockSysPool: unknown;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAppPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ count: "0" }] })
    };
    mockSysPool = {};
  });

  const mockSuccessfulRead = async (path: string) => {
    const name = path.split("/").pop()?.replace(".json", "") || "test";
    return JSON.stringify({
      id: name,
      label: name.toUpperCase(),
      verdict: "GO",
      evidenceRefs: [],
      ts: Date.now()
    });
  };

  it("returns NO_GO if files are missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await getSignoffBoardService(mockAppPool as Pool, mockSysPool as Pool);

    expect(res.verdict).toBe("NO_GO");
    expect(res.pfTiles.find((t) => t.id === "pf-quick")?.verdict).toBe("NO_GO");
  });

  it("returns GO if all files exist and are GO and no triggers", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await getSignoffBoardService(mockAppPool as Pool, mockSysPool as Pool);

    expect(res.verdict).toBe("GO");
    expect(res.pfTiles.every((t) => t.verdict === "GO")).toBe(true);
    expect(res.rollbackTriggers.every((t) => t.verdict === "GO")).toBe(true);
  });

  it("returns NO_GO if there are budget violations", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockAppPool as any).query.mockResolvedValue({ rows: [{ count: "1" }] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await getSignoffBoardService(mockAppPool as Pool, mockSysPool as Pool);

    expect(res.verdict).toBe("NO_GO");
    expect(res.rollbackTriggers.find((t) => t.id === "trigger-budget")?.verdict).toBe("NO_GO");
  });

  it("enforces binary verdict: any NO_GO tile results in overall NO_GO", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readFile).mockImplementation((async (path: string) => {
      const name = path.split("/").pop()?.replace(".json", "") || "test";
      const verdict = name === "pf-quick" ? "NO_GO" : "GO";
      return JSON.stringify({
        id: name,
        label: name.toUpperCase(),
        verdict,
        evidenceRefs: [],
        ts: Date.now()
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await getSignoffBoardService(mockAppPool as Pool, mockSysPool as Pool);
    expect(res.verdict).toBe("NO_GO");
    expect(res.pfTiles.find((t) => t.id === "pf-quick")?.verdict).toBe("NO_GO");
    expect(res.pfTiles.find((t) => t.id === "pf-check")?.verdict).toBe("GO");
  });

  it("includes all mandatory PF tiles", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await getSignoffBoardService(mockAppPool as Pool, mockSysPool as Pool);
    const expectedPf = ["quick", "check", "full", "deps", "policy", "crashdemo"];
    const actualPf = res.pfTiles.map((t) => t.id.replace("pf-", ""));

    expect(actualPf).toEqual(expect.arrayContaining(expectedPf));
    expect(res.pfTiles.length).toBe(expectedPf.length);
  });

  it("includes all mandatory Proof tiles", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readFile).mockImplementation(mockSuccessfulRead as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await getSignoffBoardService(mockAppPool as Pool, mockSysPool as Pool);
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
});
