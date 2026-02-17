import { describe, expect, test } from "vitest";

import { normalizeForSnapshot } from "../../src/lib/normalize";

describe("normalizeForSnapshot", () => {
  test("normalizes uuid timestamps and windows paths", () => {
    const normalized = normalizeForSnapshot(
      "2026-02-01T10:10:10.000Z C:\\tmp\\a 123e4567-e89b-12d3-a456-426614174000"
    );
    expect(normalized).toContain("<ISO_TS>");
    expect(normalized).toContain("<UUID>");
    expect(normalized).toContain("C:/tmp/a");
  });
});
