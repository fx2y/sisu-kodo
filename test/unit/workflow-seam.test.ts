import { describe, expect, test, vi } from "vitest";
import { repairRunWorkflow, runIntentWorkflow } from "../../src/workflow/wf/run-intent.wf";
import type { IntentWorkflowSteps } from "../../src/workflow/wf/run-intent.wf";
import type { Intent } from "../../src/contracts/intent.schema";

describe("workflow seam unit tests", () => {
  test("runIntentWorkflow orchestrates steps in order", async () => {
    const intent: Intent = {
      goal: "test goal",
      inputs: {},
      constraints: {},
      connectors: []
    };

    const steps: IntentWorkflowSteps = {
      load: vi.fn().mockResolvedValue({ runId: "run_123", intent, planApprovalTimeoutS: 3600 }),
      compile: vi.fn().mockResolvedValue({}),
      applyPatch: vi.fn().mockResolvedValue({}),
      decide: vi.fn().mockResolvedValue({}),
      buildTasks: vi.fn().mockResolvedValue([{ taskKey: "task-1" }]),
      startTask: vi.fn().mockResolvedValue({
        getResult: () =>
          Promise.resolve({
            exit: 0,
            stdout: "ok",
            stderr: "",
            filesOut: [],
            metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 1 },
            sandboxRef: "mock",
            errCode: "NONE",
            taskKey: "task-1"
          })
      }),
      executeTask: vi.fn(),
      saveExecuteStep: vi.fn().mockResolvedValue(undefined),
      saveArtifacts: vi.fn().mockResolvedValue("artifact-ref"),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateOps: vi.fn().mockResolvedValue(undefined),
      isPlanApproved: vi.fn().mockResolvedValue(true),
      getRun: vi.fn().mockResolvedValue({ intentId: "it_123", status: "running", retryCount: 1 }),
      getRunSteps: vi.fn().mockResolvedValue([]),
      emitQuestion: vi.fn().mockResolvedValue(undefined),
      emitStatusEvent: vi.fn().mockResolvedValue(undefined),
      emitStatusEventImpure: vi.fn().mockResolvedValue(undefined),
      enqueueEscalation: vi.fn().mockResolvedValue(undefined),
      streamChunk: vi.fn().mockResolvedValue(undefined),
      updateOpsImpure: vi.fn().mockResolvedValue(undefined),
      openHumanGate: vi.fn().mockResolvedValue(undefined),
      wasPromptEmitted: vi.fn().mockResolvedValue(false),
      isGateOpen: vi.fn().mockResolvedValue(false),
      recv: vi.fn().mockResolvedValue({ choice: "yes" }),
      setEvent: vi.fn().mockResolvedValue(undefined),
      getTimestamp: vi.fn().mockReturnValue(123),
      getRunByWorkflowIdImpure: vi.fn().mockResolvedValue(null),
      waitForEvent: vi.fn().mockResolvedValue({ type: "answer", payload: {} })
    };

    await runIntentWorkflow(steps, "it_123");

    expect(steps.load).toHaveBeenCalledWith("it_123");
    expect(steps.updateOps).toHaveBeenCalledWith(
      "run_123",
      expect.objectContaining({ status: "running" })
    );
    expect(steps.compile).toHaveBeenCalledWith("run_123", intent);
    expect(steps.applyPatch).toHaveBeenCalled();
    expect(steps.decide).toHaveBeenCalled();
    expect(steps.startTask).toHaveBeenCalled();
    expect(steps.saveExecuteStep).toHaveBeenCalled();
    expect(steps.updateStatus).toHaveBeenCalledWith("run_123", "succeeded");

    // Verify order
    const loadIdx = vi.mocked(steps.load).mock.invocationCallOrder[0];
    const runIdx = vi.mocked(steps.updateOps).mock.invocationCallOrder[0];
    const compileIdx = vi.mocked(steps.compile).mock.invocationCallOrder[0];
    const startTaskIdx = vi.mocked(steps.startTask).mock.invocationCallOrder[0];
    const successIdx = vi.mocked(steps.updateStatus).mock.invocationCallOrder[0];

    expect(loadIdx).toBeLessThan(runIdx);
    expect(runIdx).toBeLessThan(compileIdx);
    expect(compileIdx).toBeLessThan(startTaskIdx);
    expect(startTaskIdx).toBeLessThan(successIdx);
  });

  test("runIntentWorkflow fails if load fails", async () => {
    const steps: IntentWorkflowSteps = {
      load: vi.fn().mockRejectedValue(new Error("Load failed")),
      compile: vi.fn(),
      applyPatch: vi.fn(),
      decide: vi.fn(),
      buildTasks: vi.fn(),
      startTask: vi.fn(),
      executeTask: vi.fn(),
      saveExecuteStep: vi.fn(),
      saveArtifacts: vi.fn(),
      updateStatus: vi.fn(),
      updateOps: vi.fn(),
      isPlanApproved: vi.fn().mockResolvedValue(true),
      getRun: vi.fn().mockResolvedValue({ intentId: "it_123", status: "running", retryCount: 1 }),
      getRunSteps: vi.fn(),
      emitQuestion: vi.fn(),
      emitStatusEvent: vi.fn(),
      emitStatusEventImpure: vi.fn(),
      enqueueEscalation: vi.fn(),
      streamChunk: vi.fn(),
      updateOpsImpure: vi.fn(),
      openHumanGate: vi.fn(),
      wasPromptEmitted: vi.fn().mockResolvedValue(false),
      isGateOpen: vi.fn().mockResolvedValue(false),
      recv: vi.fn(),
      setEvent: vi.fn(),
      getTimestamp: vi.fn().mockReturnValue(123),
      getRunByWorkflowIdImpure: vi.fn().mockResolvedValue(null),
      waitForEvent: vi.fn()
    };

    await expect(runIntentWorkflow(steps, "it_123")).rejects.toThrow("Load failed");
    expect(steps.updateStatus).not.toHaveBeenCalled();
  });

  test("runIntentWorkflow fails if intent validation fails", async () => {
    const invalidIntent = { goal: 123 } as unknown as Intent; // goal must be string

    const steps: IntentWorkflowSteps = {
      load: vi
        .fn()
        .mockResolvedValue({ runId: "run_123", intent: invalidIntent, planApprovalTimeoutS: 3600 }),
      compile: vi.fn(),
      applyPatch: vi.fn(),
      decide: vi.fn(),
      buildTasks: vi.fn(),
      startTask: vi.fn(),
      executeTask: vi.fn(),
      saveExecuteStep: vi.fn(),
      saveArtifacts: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateOps: vi.fn().mockResolvedValue(undefined),
      isPlanApproved: vi.fn().mockResolvedValue(true),
      getRun: vi.fn().mockResolvedValue({ intentId: "it_123", status: "running", retryCount: 1 }),
      getRunSteps: vi.fn(),
      emitQuestion: vi.fn(),
      emitStatusEvent: vi.fn(),
      emitStatusEventImpure: vi.fn(),
      enqueueEscalation: vi.fn(),
      streamChunk: vi.fn(),
      updateOpsImpure: vi.fn(),
      openHumanGate: vi.fn(),
      wasPromptEmitted: vi.fn().mockResolvedValue(false),
      isGateOpen: vi.fn().mockResolvedValue(false),
      recv: vi.fn(),
      setEvent: vi.fn(),
      getTimestamp: vi.fn().mockReturnValue(123),
      getRunByWorkflowIdImpure: vi.fn().mockResolvedValue(null),
      waitForEvent: vi.fn()
    };

    await expect(runIntentWorkflow(steps, "it_123")).rejects.toThrow();
    expect(steps.updateStatus).not.toHaveBeenCalled();
  });

  test("repairRunWorkflow rejects malformed checkpoint outputs", async () => {
    const intent: Intent = {
      goal: "repair me",
      inputs: {},
      constraints: {}
    };
    const steps: IntentWorkflowSteps = {
      load: vi.fn().mockResolvedValue({ runId: "run_123", intent, planApprovalTimeoutS: 3600 }),
      compile: vi.fn(),
      applyPatch: vi.fn(),
      decide: vi.fn(),
      buildTasks: vi.fn(),
      startTask: vi.fn(),
      executeTask: vi.fn(),
      saveExecuteStep: vi.fn(),
      saveArtifacts: vi.fn(),
      updateStatus: vi.fn(),
      updateOps: vi.fn().mockResolvedValue(undefined),
      isPlanApproved: vi.fn().mockResolvedValue(true),
      getRun: vi.fn().mockResolvedValue({ intentId: "it_123", status: "failed", retryCount: 1 }),
      getRunSteps: vi.fn().mockResolvedValue([
        {
          stepId: "CompileST",
          phase: "compilation",
          output: { bad: true },
          startedAt: undefined,
          finishedAt: undefined
        }
      ]),
      emitQuestion: vi.fn(),
      emitStatusEvent: vi.fn(),
      emitStatusEventImpure: vi.fn(),
      enqueueEscalation: vi.fn(),
      streamChunk: vi.fn(),
      updateOpsImpure: vi.fn(),
      openHumanGate: vi.fn(),
      wasPromptEmitted: vi.fn().mockResolvedValue(false),
      isGateOpen: vi.fn().mockResolvedValue(false),
      recv: vi.fn(),
      setEvent: vi.fn(),
      getTimestamp: vi.fn().mockReturnValue(123),
      getRunByWorkflowIdImpure: vi.fn().mockResolvedValue(null),
      waitForEvent: vi.fn()
    };

    await expect(repairRunWorkflow(steps, "run_123")).rejects.toThrow("invalid plan output");
    expect(steps.compile).not.toHaveBeenCalled();
    expect(steps.updateOps).toHaveBeenLastCalledWith(
      "run_123",
      expect.objectContaining({ status: "retries_exceeded", nextAction: "REPAIR" })
    );
  });
});
