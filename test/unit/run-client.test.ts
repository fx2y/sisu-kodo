import { afterEach, describe, expect, test, vi } from "vitest";
import { startRun } from "../../src/lib/run-client";
import type { RunClientError } from "../../src/lib/run-client";

describe("run-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns canonical start response with replay flag", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              workflowID: "ih_123",
              status: "PENDING",
              isReplay: true
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      )
    );

    const result = await startRun({
      recipeRef: { id: "compile-default", v: "v1" },
      formData: { goal: "demo" },
      opts: { lane: "interactive", queuePartitionKey: "ui-default" }
    });

    expect(result.workflowID).toBe("ih_123");
    expect(result.isReplay).toBe(true);
  });

  test("surfaces lattice error payload and drift details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "run identity conflict",
              drift: [{ field: "budget", existing: 1, incoming: 2 }]
            }),
            { status: 409, headers: { "content-type": "application/json" } }
          )
      )
    );

    await expect(
      startRun({
        recipeRef: { id: "compile-default", v: "v1" },
        formData: { goal: "demo" },
        opts: { lane: "interactive", queuePartitionKey: "ui-default" }
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<RunClientError>>({
        message: "run identity conflict",
        status: 409,
        details: expect.objectContaining({
          drift: [expect.objectContaining({ field: "budget" })]
        })
      })
    );
  });
});
