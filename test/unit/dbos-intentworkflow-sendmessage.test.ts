import { beforeEach, describe, expect, test, vi } from "vitest";
import { sha256 } from "../../src/lib/hash";

const sendSpy = vi.fn();
const getEventSpy = vi.fn();
const setEventSpy = vi.fn();

vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    send: sendSpy,
    startWorkflow: vi.fn(),
    retrieveWorkflow: vi.fn(),
    recv: vi.fn(),
    getEvent: getEventSpy,
    setEvent: setEventSpy,
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
    getEventSpy.mockReset();
    setEventSpy.mockReset();
  });

  test("dedupes message sends via workflow event key when dedupeKey is present", async () => {
    getEventSpy.mockResolvedValueOnce(null);
    const { buildIntentWorkflowSteps } = await import("../../src/workflow/dbos/intentWorkflow");
    const steps = buildIntentWorkflowSteps();

    await steps.sendMessage("wf-1", { ok: true }, "human:g1", "dedupe-1");

    expect(getEventSpy).toHaveBeenCalledTimes(1);
    expect(setEventSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  test("skips duplicate send when dedupe event already exists", async () => {
    const payload = { ok: true };
    getEventSpy.mockResolvedValueOnce(sha256(payload));
    const { buildIntentWorkflowSteps } = await import("../../src/workflow/dbos/intentWorkflow");
    const steps = buildIntentWorkflowSteps();

    await steps.sendMessage("wf-1", payload, "human:g1", "dedupe-1");

    expect(sendSpy).not.toHaveBeenCalled();
    expect(setEventSpy).not.toHaveBeenCalled();
  });

  test("uses DBOS.send directly for non-human topics", async () => {
    const { buildIntentWorkflowSteps } = await import("../../src/workflow/dbos/intentWorkflow");
    const steps = buildIntentWorkflowSteps();

    await steps.sendMessage("wf-2", { ok: true }, "sys:status");

    expect(getEventSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith("wf-2", { ok: true }, "sys:status");
  });
});
