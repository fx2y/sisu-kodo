import { describe, expect, test } from "vitest";
import { loadSignoffBoard, SignoffClientError } from "../../src/lib/signoff-client";

function makeValidBoard() {
  return {
    verdict: "NO_GO" as const,
    posture: {
      topology: "split",
      runtimeMode: "api-shim",
      ocMode: "replay",
      sbxMode: "mock",
      sbxProvider: "e2b",
      appVersion: "v1",
      claimScope: "signoff"
    },
    pfTiles: [
      {
        id: "pf-quick",
        label: "PF QUICK",
        verdict: "GO" as const,
        evidenceRefs: ["artifact:.tmp/signoff/pf-quick.json"],
        ts: 1700000000000
      }
    ],
    proofTiles: [
      {
        id: "proof-api-run-idem",
        label: "API RUN IDEM",
        verdict: "GO" as const,
        evidenceRefs: ["test:GP10"],
        ts: 1700000000000
      }
    ],
    rollbackTriggers: [
      {
        id: "trigger-budget",
        label: "Budget Violations (24h)",
        verdict: "GO" as const,
        evidenceRefs: ["sql:app.artifacts#budget_violation_24h"],
        ts: 1700000000000
      }
    ],
    ts: 1700000000000
  };
}

describe("signoff-client", () => {
  test("asserts signoff board payload before returning", async () => {
    const data = makeValidBoard();
    const fetchImpl: typeof fetch = (async () =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;

    await expect(loadSignoffBoard(fetchImpl)).resolves.toEqual(data);
  });

  test("surfaces http status errors before success-path parsing", async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;

    await expect(loadSignoffBoard(fetchImpl)).rejects.toEqual(
      expect.objectContaining<Partial<SignoffClientError>>({
        name: "SignoffClientError",
        message: "boom",
        status: 500,
        kind: "http"
      })
    );
  });

  test("fails closed on invalid payload shape", async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response(JSON.stringify({ verdict: "GO" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;

    await expect(loadSignoffBoard(fetchImpl)).rejects.toEqual(
      expect.objectContaining<Partial<SignoffClientError>>({
        name: "SignoffClientError",
        message: "signoff_payload_invalid",
        kind: "parse"
      })
    );
  });
});
