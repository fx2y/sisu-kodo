import { describe, expect, test } from "vitest";
import { resolveApprovalChoice, resolveApprovalRationale } from "../../src/workflow/hitl/decision-payload";

describe("HITL approval payload normalization", () => {
  test("prefers canonical choice field", () => {
    expect(resolveApprovalChoice({ choice: "yes", approved: false, decision: "reject" })).toBe("yes");
  });

  test("maps approved boolean aliases", () => {
    expect(resolveApprovalChoice({ approved: true })).toBe("yes");
    expect(resolveApprovalChoice({ approved: false })).toBe("no");
  });

  test("maps walkthrough decision aliases", () => {
    expect(resolveApprovalChoice({ decision: "approve" })).toBe("yes");
    expect(resolveApprovalChoice({ decision: "approved" })).toBe("yes");
    expect(resolveApprovalChoice({ decision: "reject" })).toBe("no");
  });

  test("defaults unknown shape to no fail-closed", () => {
    expect(resolveApprovalChoice({ decision: "maybe" })).toBe("no");
    expect(resolveApprovalChoice({})).toBe("no");
  });

  test("extracts rationale aliases", () => {
    expect(resolveApprovalRationale({ rationale: "r1" })).toBe("r1");
    expect(resolveApprovalRationale({ reason: "r2" })).toBe("r2");
    expect(resolveApprovalRationale({ note: "r3" })).toBe("r3");
    expect(resolveApprovalRationale({ notes: "r4" })).toBe("r4");
    expect(resolveApprovalRationale({})).toBeNull();
  });
});
