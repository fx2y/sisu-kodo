import { describe, expect, it } from "vitest";
import { resolveIntentRuntimeFlags } from "../../src/intent-compiler/runtime-flags";
import type { Intent } from "../../src/contracts/intent.schema";

function mkIntent(goal: string, constraints: Record<string, unknown> = {}): Intent {
  return { goal, inputs: {}, constraints };
}

describe("resolveIntentRuntimeFlags", () => {
  it("uses deterministic defaults when constraints omit test hooks", () => {
    const flags = resolveIntentRuntimeFlags(mkIntent("plain run"), 120);
    expect(flags.openAskGate).toBe(false);
    expect(flags.parallelApprovals).toBe(false);
    expect(flags.planApprovalTimeoutS).toBe(120);
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

  it("honors explicit false values from constraints", () => {
    const flags = resolveIntentRuntimeFlags(
      mkIntent("plain run", {
        testHooks: {
          askUser: false,
          parallelApprovals: false,
          planApprovalTimeoutS: 7
        }
      }),
      120
    );
    expect(flags.openAskGate).toBe(false);
    expect(flags.parallelApprovals).toBe(false);
    expect(flags.planApprovalTimeoutS).toBe(7);
  });
});
