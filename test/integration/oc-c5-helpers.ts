import { getConfig } from "../../src/config";
import { getPool } from "../../src/db/pool";
import { insertIntent } from "../../src/db/intentRepo";
import { insertRun } from "../../src/db/runRepo";
import { createOCWrapper, type OCWrapper } from "../../src/oc/wrapper";

export function createReplayWrapper(ocTimeoutMs: number): OCWrapper {
  process.env.OC_MODE = "replay";
  process.env.OC_BASE_URL = "http://localhost:4096";
  process.env.OC_TIMEOUT_MS = String(ocTimeoutMs);
  return createOCWrapper(getConfig());
}

export async function seedRunningRun(params: {
  runId: string;
  intentId: string;
  goal: string;
}): Promise<void> {
  const pool = getPool();
  await insertIntent(pool, params.intentId, {
    goal: params.goal,
    inputs: {},
    constraints: {},
    connectors: []
  });
  await insertRun(pool, {
    id: params.runId,
    intent_id: params.intentId,
    workflow_id: params.intentId,
    status: "running"
  });
}
