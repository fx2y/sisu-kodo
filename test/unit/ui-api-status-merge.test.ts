import { describe, expect, it } from "vitest";
import { mergeRunHeaderStatusWithDbos } from "../../src/server/ui-api";

describe("mergeRunHeaderStatusWithDbos", () => {
  it("does not downgrade durable pending when DBOS reports pending", () => {
    expect(mergeRunHeaderStatusWithDbos("PENDING", "PENDING")).toBe("PENDING");
  });

  it("upgrades ENQUEUED to PENDING on DBOS running", () => {
    expect(mergeRunHeaderStatusWithDbos("ENQUEUED", "RUNNING")).toBe("PENDING");
  });

  it("upgrades non-terminal to terminal when DBOS is terminal", () => {
    expect(mergeRunHeaderStatusWithDbos("PENDING", "SUCCESS")).toBe("SUCCESS");
  });

  it("keeps durable terminal status when DBOS is stale non-terminal", () => {
    expect(mergeRunHeaderStatusWithDbos("SUCCESS", "RUNNING")).toBe("SUCCESS");
  });

  it("keeps durable terminal status when DBOS disagrees at equal terminal rank", () => {
    expect(mergeRunHeaderStatusWithDbos("ERROR", "SUCCESS")).toBe("ERROR");
  });

  it("upgrades PENDING to WAITING_INPUT when DBOS is WAITING", () => {
    expect(mergeRunHeaderStatusWithDbos("PENDING", "WAITING")).toBe("WAITING_INPUT");
  });

  it("keeps WAITING_INPUT when DBOS is RUNNING (equal rank, durable wins)", () => {
    expect(mergeRunHeaderStatusWithDbos("WAITING_INPUT", "RUNNING")).toBe("WAITING_INPUT");
  });

  it("upgrades WAITING_INPUT to SUCCESS", () => {
    expect(mergeRunHeaderStatusWithDbos("WAITING_INPUT", "SUCCESS")).toBe("SUCCESS");
  });
});
