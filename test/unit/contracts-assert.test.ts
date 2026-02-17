import { describe, expect, test } from "vitest";
import { ajv, assertValid, ValidationError } from "../../src/contracts";

describe("contracts assert", () => {
  const schema = {
    type: "object",
    required: ["foo"],
    properties: {
      foo: { type: "string" }
    }
  } as const;
  const validate = ajv.compile(schema);

  test("assertValid passes for valid input", () => {
    const input = { foo: "bar" };
    expect(() => assertValid(validate, input, "test")).not.toThrow();
  });

  test("assertValid throws ValidationError for invalid input", () => {
    const input = { foo: 123 };
    expect(() => assertValid(validate, input, "test")).toThrow(ValidationError);
    try {
      assertValid(validate, input, "test");
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain("invalid test");
      expect(err.errors).toHaveLength(1);
      expect(err.errors[0].keyword).toBe("type");
    }
  });
});
