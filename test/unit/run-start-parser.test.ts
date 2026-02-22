import { describe, expect, it } from "vitest";
import { parseLegacyRunStartPayload } from "../../src/intent-compiler/run-start";
import { ValidationError } from "../../src/contracts/assert";

describe("parseLegacyRunStartPayload", () => {
  it("extracts intentId and runRequest payload", () => {
    const parsed = parseLegacyRunStartPayload({
      intentId: "it_123",
      queueName: "intentQ",
      traceId: "trace-1"
    });

    expect(parsed).toEqual({
      intentId: "it_123",
      runRequest: {
        queueName: "intentQ",
        traceId: "trace-1"
      }
    });
  });

  it("fails closed on malformed payload", () => {
    expect(() => parseLegacyRunStartPayload(null)).toThrow(ValidationError);
  });

  it("fails closed when intentId is missing", () => {
    expect(() => parseLegacyRunStartPayload({})).toThrow(ValidationError);
  });
});
