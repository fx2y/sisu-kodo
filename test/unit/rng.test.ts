import { describe, expect, test } from "vitest";

import { rand, setRngSeed } from "../../src/lib/rng";

describe("rng", () => {
  test("is deterministic by seed", () => {
    setRngSeed(7);
    const a = [rand(), rand(), rand()];

    setRngSeed(7);
    const b = [rand(), rand(), rand()];

    expect(a).toEqual(b);
  });
});
