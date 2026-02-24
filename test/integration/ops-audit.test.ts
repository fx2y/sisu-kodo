import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startApp } from "../../src/server/app";
import type { TestLifecycle } from "./lifecycle";
import { setupLifecycle, teardownLifecycle } from "./lifecycle";
import { generateOpsTestId } from "../helpers/ops-fixtures";

type AppHandle = {
  close: () => Promise<void>;
};

let lifecycle: TestLifecycle;
let app: AppHandle;

beforeAll(async () => {
  lifecycle = await setupLifecycle(351);
  const started = await startApp(lifecycle.pool, lifecycle.workflow);
  app = {
    close: () => new Promise<void>((resolve) => started.server.close(() => resolve()))
  };
});

afterAll(async () => {
  await app.close();
  await teardownLifecycle(lifecycle);
});

describe("ops audit feed (CY3.3)", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}/api/ops/wf`;

  test("GET /api/ops/wf/:id returns operator action history in audit field", async () => {
    const workflowID = generateOpsTestId("ops-audit");
    await lifecycle.workflow.startCrashDemo(workflowID);
    
    // Perform some ops actions
    await fetch(`${baseUrl}/${workflowID}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "audit-test-actor", reason: "testing audit feed" })
    });

    await fetch(`${baseUrl}/${workflowID}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "audit-test-actor", reason: "resuming for audit" })
    });

    // Wait for actions to settle (persistOpIntent is async but we are on same pool)
    const res = await fetch(`${baseUrl}/${workflowID}`);
    expect(res.status).toBe(200);
    const detail = await res.json();
    const audit = detail.audit;
    
    expect(Array.isArray(audit)).toBe(true);
    expect(audit.length).toBeGreaterThanOrEqual(2);
    
    // Newest first
    expect(audit[0].op).toBe("resume");
    expect(audit[0].actor).toBe("audit-test-actor");
    expect(audit[0].reason).toBe("resuming for audit");
    expect(audit[0].targetWorkflowID).toBe(workflowID);
    expect(typeof audit[0].at).toBe("string");

    expect(audit[1].op).toBe("cancel");
    expect(audit[1].actor).toBe("audit-test-actor");
    expect(audit[1].reason).toBe("testing audit feed");
  });

  test("GET /api/ops/wf/:id returns empty audit array for new workflow", async () => {
    const workflowID = generateOpsTestId("ops-audit-empty");
    await lifecycle.workflow.startCrashDemo(workflowID);
    
    const res = await fetch(`${baseUrl}/${workflowID}`);
    expect(res.status).toBe(200);
    const detail = await res.json();
    const audit = detail.audit;
    expect(audit).toEqual([]);
  });
});
