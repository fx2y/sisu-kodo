import { describe, expect, test } from "vitest";
import { assertDedupeOrPriorityEdge, QueuePolicyError } from "../../src/workflow/queue-policy";

describe("queue policy edge controls", () => {
  test("rejects enqueue options missing both dedupe and priority", () => {
    expect(() => assertDedupeOrPriorityEdge({})).toThrowError(QueuePolicyError);
    expect(() => assertDedupeOrPriorityEdge({})).toThrow("dedupe_or_priority_required");
  });

  test("accepts dedupe-only or priority-only edges", () => {
    expect(() => assertDedupeOrPriorityEdge({ deduplicationID: "dk" })).not.toThrow();
    expect(() => assertDedupeOrPriorityEdge({ priority: 1 })).not.toThrow();
  });
});
