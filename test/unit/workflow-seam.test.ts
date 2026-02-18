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
      load: vi.fn().mockResolvedValue({ runId: "run_123", intent }),
      compile: vi.fn().mockResolvedValue({}),
      applyPatch: vi.fn().mockResolvedValue({}),
      decide: vi.fn().mockResolvedValue({}),
      execute: vi.fn().mockResolvedValue({ stdout: "ok", files: {} }),
      saveArtifacts: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateOps: vi.fn().mockResolvedValue(undefined),
      getRun: vi.fn().mockResolvedValue({ intentId: "it_123", status: "running", retryCount: 1 }),
      getRunSteps: vi.fn().mockResolvedValue([]),
      emitQuestion: vi.fn().mockResolvedValue(undefined),
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
    expect(steps.execute).toHaveBeenCalled();
    expect(steps.saveArtifacts).toHaveBeenCalledWith("run_123", "ExecuteST", expect.any(Object));
    expect(steps.updateStatus).toHaveBeenCalledWith("run_123", "succeeded");

    // Verify order
    const loadIdx = vi.mocked(steps.load).mock.invocationCallOrder[0];
    const runIdx = vi.mocked(steps.updateOps).mock.invocationCallOrder[0];
    const compileIdx = vi.mocked(steps.compile).mock.invocationCallOrder[0];
    const saveIdx = vi.mocked(steps.saveArtifacts).mock.invocationCallOrder[0];
    const successIdx = vi.mocked(steps.updateStatus).mock.invocationCallOrder[0];

    expect(loadIdx).toBeLessThan(runIdx);
    expect(runIdx).toBeLessThan(compileIdx);
    expect(compileIdx).toBeLessThan(saveIdx);
    expect(saveIdx).toBeLessThan(successIdx);
  });

  test("runIntentWorkflow fails if load fails", async () => {
    const steps: IntentWorkflowSteps = {
      load: vi.fn().mockRejectedValue(new Error("Load failed")),
      compile: vi.fn(),
      applyPatch: vi.fn(),
      decide: vi.fn(),
      execute: vi.fn(),
      saveArtifacts: vi.fn(),
      updateStatus: vi.fn(),
      updateOps: vi.fn(),
      getRun: vi.fn().mockResolvedValue({ intentId: "it_123", status: "running", retryCount: 1 }),
      getRunSteps: vi.fn(),
      emitQuestion: vi.fn(),
      waitForEvent: vi.fn()
    };

    await expect(runIntentWorkflow(steps, "it_123")).rejects.toThrow("Load failed");
    expect(steps.updateStatus).not.toHaveBeenCalled();
  });

  test("runIntentWorkflow fails if intent validation fails", async () => {
    const invalidIntent = { goal: 123 } as unknown as Intent; // goal must be string

    const steps: IntentWorkflowSteps = {
      load: vi.fn().mockResolvedValue({ runId: "run_123", intent: invalidIntent }),
      compile: vi.fn(),
      applyPatch: vi.fn(),
      decide: vi.fn(),
      execute: vi.fn(),
      saveArtifacts: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateOps: vi.fn().mockResolvedValue(undefined),
      getRun: vi.fn().mockResolvedValue({ intentId: "it_123", status: "running", retryCount: 1 }),
      getRunSteps: vi.fn(),
      emitQuestion: vi.fn(),
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
      load: vi.fn().mockResolvedValue({ runId: "run_123", intent }),
      compile: vi.fn(),
      applyPatch: vi.fn(),
      decide: vi.fn(),
      execute: vi.fn(),
      saveArtifacts: vi.fn(),
      updateStatus: vi.fn(),
      updateOps: vi.fn().mockResolvedValue(undefined),
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
      waitForEvent: vi.fn()
    };

    await expect(repairRunWorkflow(steps, "run_123")).rejects.toThrow("invalid CompileST output");
    expect(steps.compile).not.toHaveBeenCalled();
    expect(steps.updateOps).toHaveBeenLastCalledWith(
      "run_123",
      expect.objectContaining({ status: "retries_exceeded", nextAction: "REPAIR" })
    );
  });
});
