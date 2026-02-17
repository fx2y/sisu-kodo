import { describe, expect, test, vi } from "vitest";
import type { WorkflowService } from "../../src/workflow/port";

describe("workflow port", () => {
  test("is mockable", async () => {
    const mockWorkflow: WorkflowService = {
      trigger: vi.fn(),
      marks: vi.fn().mockResolvedValue({ s1: 1, s2: 1 }),
      resumeIncomplete: vi.fn(),
      waitUntilComplete: vi.fn()
    };

    await mockWorkflow.trigger("test-id");
    expect(mockWorkflow.trigger).toHaveBeenCalledWith("test-id");

    const marks = await mockWorkflow.marks("test-id");
    expect(marks).toEqual({ s1: 1, s2: 1 });
  });
});
