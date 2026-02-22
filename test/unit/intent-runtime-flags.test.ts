import { describe, expect, it } from "vitest";
import { resolveIntentRuntimeFlags } from "../../src/intent-compiler/runtime-flags";
import type { Intent } from "../../src/contracts/intent.schema";

function mkIntent(goal: string, constraints: Record<string, unknown> = {}): Intent {
  return { goal, inputs: {}, constraints };
}

describe("resolveIntentRuntimeFlags", () => {
  it("keeps legacy goal behavior for ask/parallel/timeout test hints", () => {
    const flags = resolveIntentRuntimeFlags(
      mkIntent("ask and parallel test with timeout test"),
      120
    );
    expect(flags.openAskGate).toBe(true);
    expect(flags.parallelApprovals).toBe(true);
    expect(flags.planApprovalTimeoutS).toBe(2);
  });

  it("accepts explicit constraint overrides from testHooks", () => {
    const flags = resolveIntentRuntimeFlags(
      mkIntent("plain run", {
        testHooks: {
          askUser: true,
          parallelApprovals: true,
          planApprovalTimeoutS: 9
        }
      }),
      120
    );
    expect(flags.openAskGate).toBe(true);
    expect(flags.parallelApprovals).toBe(true);
    expect(flags.planApprovalTimeoutS).toBe(9);
  });

  it("lets explicit false override legacy goal hint", () => {
    const flags = resolveIntentRuntimeFlags(
      mkIntent("ask parallel test timeout test", {
        testHooks: {
          askUser: false,
          parallelApprovals: false
        }
      }),
      120
    );
    expect(flags.openAskGate).toBe(false);
    expect(flags.parallelApprovals).toBe(false);
    expect(flags.planApprovalTimeoutS).toBe(2);
  });
});
