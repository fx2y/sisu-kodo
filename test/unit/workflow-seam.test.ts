import { describe, expect, test, vi } from "vitest";
import { runIntentWorkflow } from "../../src/workflow/wf/run-intent.wf";
import type { IntentWorkflowSteps } from "../../src/workflow/wf/run-intent.wf";
import type { Intent } from "../../src/contracts/intent.schema";
import type { OCOutput } from "../../src/oc/schema";

describe("workflow seam unit tests", () => {
  test("runIntentWorkflow orchestrates steps in order", async () => {
    const intent: Intent = {
      goal: "test goal",
      inputs: {},
      constraints: {},
      connectors: []
    };

    const output: OCOutput = {
      prompt: "test prompt",
      toolcalls: [],
      responses: [],
      diffs: []
    };

    const steps: IntentWorkflowSteps = {
      loadContext: vi.fn().mockResolvedValue({ runId: "run_123", intent }),
      startRun: vi.fn().mockResolvedValue(undefined),
      dummyOCStep: vi.fn().mockResolvedValue(output),
      finishRun: vi.fn().mockResolvedValue(undefined)
    };

    await runIntentWorkflow(steps, "itwf_123");

    expect(steps.loadContext).toHaveBeenCalledWith("itwf_123");
    expect(steps.startRun).toHaveBeenCalledWith("run_123");
    expect(steps.dummyOCStep).toHaveBeenCalledWith("run_123");
    expect(steps.finishRun).toHaveBeenCalledWith("run_123");

    // Verify order
    const loadIdx = vi.mocked(steps.loadContext).mock.invocationCallOrder[0];
    const startIdx = vi.mocked(steps.startRun).mock.invocationCallOrder[0];
    const ocIdx = vi.mocked(steps.dummyOCStep).mock.invocationCallOrder[0];
    const finishIdx = vi.mocked(steps.finishRun).mock.invocationCallOrder[0];

    expect(loadIdx).toBeLessThan(startIdx);
    expect(startIdx).toBeLessThan(ocIdx);
    expect(ocIdx).toBeLessThan(finishIdx);
  });

  test("runIntentWorkflow fails if loadContext fails", async () => {
    const steps: IntentWorkflowSteps = {
      loadContext: vi.fn().mockRejectedValue(new Error("Load failed")),
      startRun: vi.fn(),
      dummyOCStep: vi.fn(),
      finishRun: vi.fn()
    };

    await expect(runIntentWorkflow(steps, "itwf_123")).rejects.toThrow("Load failed");
    expect(steps.startRun).not.toHaveBeenCalled();
  });

  test("runIntentWorkflow fails if intent validation fails", async () => {
    const invalidIntent = { goal: 123 } as unknown as Intent; // goal must be string

    const steps: IntentWorkflowSteps = {
      loadContext: vi.fn().mockResolvedValue({ runId: "run_123", intent: invalidIntent }),
      startRun: vi.fn(),
      dummyOCStep: vi.fn(),
      finishRun: vi.fn()
    };

    await expect(runIntentWorkflow(steps, "itwf_123")).rejects.toThrow();
    expect(steps.startRun).not.toHaveBeenCalled();
  });
});
