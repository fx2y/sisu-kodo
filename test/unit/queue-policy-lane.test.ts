import { describe, expect, test } from "vitest";
import { resolveLanePriority } from "../../src/workflow/queue-policy";

describe("queue policy lane defaults", () => {
  test("defaults interactive lane to highest priority", () => {
    expect(resolveLanePriority(undefined, undefined)).toBe(1);
    expect(resolveLanePriority("interactive", undefined)).toBe(1);
  });

  test("defaults batch lane to lower priority", () => {
    expect(resolveLanePriority("batch", undefined)).toBe(1000);
  });

  test("keeps explicit priority over lane defaults", () => {
    expect(resolveLanePriority("interactive", 7)).toBe(7);
    expect(resolveLanePriority("batch", 9)).toBe(9);
  });
});
