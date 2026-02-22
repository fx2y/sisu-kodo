import { describe, expect, test } from "vitest";
import { assertNoFlake } from "../../src/fixtures/fanout";

describe("fixture flake block", () => {
  test("detects mismatch between two fixture runs", () => {
    const first = [
      { fixtureId: "f1", ok: true, eval: [{ checkId: "c1", pass: true, reason: "ok" }] }
    ];
    const second = [
      { fixtureId: "f1", ok: false, eval: [{ checkId: "c1", pass: false, reason: "bad" }] }
    ];
    const outcome = assertNoFlake(first, second);
    expect(outcome.stable).toBe(false);
    expect(outcome.hashA).not.toBe(outcome.hashB);
  });

  test("passes when normalized runs are equal", () => {
    const first = [
      { fixtureId: "f1", ok: true, eval: [{ checkId: "c1", pass: true, reason: "ok" }] }
    ];
    const second = [
      { fixtureId: "f1", ok: true, eval: [{ checkId: "c1", pass: true, reason: "ok" }] }
    ];
    const outcome = assertNoFlake(first, second);
    expect(outcome.stable).toBe(true);
    expect(outcome.hashA).toBe(outcome.hashB);
  });
});
