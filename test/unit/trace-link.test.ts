import { describe, expect, it } from "vitest";
import { buildTraceUrl } from "../../src/lib/trace-link";

describe("buildTraceUrl", () => {
  it("returns null when trace configuration is missing", () => {
    expect(buildTraceUrl(undefined, "trace-1")).toBeNull();
    expect(buildTraceUrl("https://trace.local/trace/{traceId}", undefined)).toBeNull();
  });

  it("renders URL templates with trace and span ids", () => {
    const url = buildTraceUrl(
      "https://trace.local/trace/{traceId}?span={spanId}",
      "trace-1",
      "span-1"
    );
    expect(url).toBe("https://trace.local/trace/trace-1?span=span-1");
  });

  it("falls back to appending encoded trace id", () => {
    const url = buildTraceUrl("https://trace.local/trace", "trace/with/slash");
    expect(url).toBe("https://trace.local/trace/trace%2Fwith%2Fslash");
  });
});
