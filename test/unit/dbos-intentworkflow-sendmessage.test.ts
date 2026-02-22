import { beforeEach, describe, expect, test, vi } from "vitest";

const sendSpy = vi.fn();

vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    send: sendSpy,
    startWorkflow: vi.fn(),
    retrieveWorkflow: vi.fn(),
    recv: vi.fn(),
    setEvent: vi.fn(),
    step: () => (_target: unknown, _ctx: unknown) => {},
    runStep: vi.fn(),
    className: () => (target: unknown) => target,
    workflow: () => (_target: unknown, _ctx: unknown) => {}
  },
  DBOSWorkflowConflictError: class extends Error {}
}));

describe("DBOS intent workflow adapter", () => {
  beforeEach(() => {
    sendSpy.mockReset();
  });

  test("forwards dedupeKey to DBOS.send from workflow-context sendMessage", async () => {
    const { buildIntentWorkflowSteps } = await import("../../src/workflow/dbos/intentWorkflow");
    const steps = buildIntentWorkflowSteps();

    await steps.sendMessage("wf-1", { ok: true }, "human:g1", "dedupe-1");

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith("wf-1", { ok: true }, "human:g1");
  });
});
