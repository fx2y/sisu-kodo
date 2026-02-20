import { describe, expect, test, vi } from "vitest";
import type { WorkflowService } from "../../src/workflow/port";

describe("workflow port", () => {
  test("is mockable", async () => {
    const mockWorkflow: WorkflowService = {
      startIntentRun: vi.fn(),
      startRepairRun: vi.fn(),
      sendMessage: vi.fn(),
      getEvent: vi.fn(),
      setEvent: vi.fn(),
      readStream: vi.fn(),
      writeStream: vi.fn(),
      closeStream: vi.fn(),
      sendEvent: vi.fn(),
      startCrashDemo: vi.fn(),
      marks: vi.fn().mockResolvedValue({ s1: 1, s2: 1 }),
      resumeIncomplete: vi.fn(),
      getWorkflowStatus: vi.fn(),
      waitUntilComplete: vi.fn(),
      listWorkflowSteps: vi.fn(),
      cancelWorkflow: vi.fn(),
      resumeWorkflow: vi.fn(),
      forkWorkflow: vi.fn(),
      listWorkflows: vi.fn(),
      getWorkflow: vi.fn(),
      startSlowStep: vi.fn(),
      getSlowMarks: vi.fn(),
      startSleepWorkflow: vi.fn(),
      destroy: vi.fn()
    };
    await mockWorkflow.startIntentRun("test-id");
    expect(mockWorkflow.startIntentRun).toHaveBeenCalledWith("test-id");

    await mockWorkflow.startCrashDemo("test-id");
    expect(mockWorkflow.startCrashDemo).toHaveBeenCalledWith("test-id");

    const marks = await mockWorkflow.marks("test-id");
    expect(marks).toEqual({ s1: 1, s2: 1 });
  });
});
