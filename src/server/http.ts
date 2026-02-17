import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { Pool } from "pg";

import type { WorkflowService } from "../workflow/port";
import { startIntentRun } from "../workflow/start-intent";
import { ValidationError } from "../contracts/assert";
import { assertIntent } from "../contracts/intent.schema";
import { assertRunRequest } from "../contracts/run-request.schema";
import { assertRunEvent } from "../contracts/run-event.schema";
import { assertRunView } from "../contracts/run-view.schema";
import { insertIntent, findIntentById } from "../db/intentRepo";
import { findRunById, findRunSteps } from "../db/runRepo";
import { findArtifactsByRunId } from "../db/artifactRepo";
import { generateId } from "../lib/id";
import { projectRunView } from "./run-view";

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks).toString();
}

function workflowIdFrom(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const id = url.searchParams.get("wf");
  return id && id.trim().length > 0 ? id : null;
}

export function buildHttpServer(pool: Pool, workflow: WorkflowService) {
  return createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        json(res, 400, { error: "bad request" });
        return;
      }

      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;

      if (req.method === "GET" && path === "/healthz") {
        json(res, 200, { ok: true });
        return;
      }

      // 1. INTENTS: POST /intents
      if (req.method === "POST" && path === "/intents") {
        const body = await readBody(req);
        let payload: unknown;
        try {
          payload = JSON.parse(body);
        } catch {
          json(res, 400, { error: "invalid json" });
          return;
        }
        assertIntent(payload);

        const id = generateId("it");
        const intent = await insertIntent(pool, id, payload);
        json(res, 201, { intentId: intent.id });
        return;
      }

      // 2. RUNS: POST /intents/:id/run
      const intentRunMatch = path.match(/^\/intents\/([^/]+)\/run$/);
      if (req.method === "POST" && intentRunMatch) {
        const intentId = intentRunMatch[1];
        const intent = await findIntentById(pool, intentId);
        if (!intent) {
          json(res, 404, { error: "intent not found" });
          return;
        }

        const body = await readBody(req);
        let reqPayload: unknown;
        try {
          reqPayload = body ? JSON.parse(body) : {};
        } catch {
          json(res, 400, { error: "invalid json" });
          return;
        }
        assertRunRequest(reqPayload);

        const { runId, workflowId } = await startIntentRun(pool, workflow, intentId, reqPayload);

        json(res, 202, { runId, workflowId });
        return;
      }

      // 4. RUNS: POST /runs/:id/retry
      const runRetryMatch = path.match(/^\/runs\/([^/]+)\/retry$/);
      if (req.method === "POST" && runRetryMatch) {
        const runId = runRetryMatch[1];
        const run = await findRunById(pool, runId);
        if (!run) {
          json(res, 404, { error: "run not found" });
          return;
        }

        // Trigger repair workflow
        await workflow.startRepairRun(runId);

        json(res, 202, { accepted: true, runId });
        return;
      }

      // 5. RUNS: POST /runs/:id/events
      const runEventMatch = path.match(/^\/runs\/([^/]+)\/events$/);
      if (req.method === "POST" && runEventMatch) {
        const runId = runEventMatch[1];
        const run = await findRunById(pool, runId);
        if (!run) {
          json(res, 404, { error: "run not found" });
          return;
        }

        const body = await readBody(req);
        let eventPayload: unknown;
        try {
          eventPayload = body ? JSON.parse(body) : {};
        } catch {
          json(res, 400, { error: "invalid json" });
          return;
        }
        assertRunEvent(eventPayload);

        await workflow.sendEvent(run.workflow_id, eventPayload);

        json(res, 202, { accepted: true });
        return;
      }

      // 3. RUNS: GET /runs/:id
      const runMatch = path.match(/^\/runs\/([^/]+)$/);
      if (req.method === "GET" && runMatch) {
        const runId = runMatch[1];
        const run = await findRunById(pool, runId);
        if (!run) {
          json(res, 404, { error: "run not found" });
          return;
        }

        const steps = await findRunSteps(pool, runId);
        const artifacts = await findArtifactsByRunId(pool, runId);

        const runView = projectRunView(run, steps, artifacts);

        // Gate 4: Egress validation
        assertRunView(runView);

        json(res, 200, runView);
        return;
      }

      // Legacy Crash Demo routes
      if (req.method === "POST" && path === "/crashdemo") {
        const wf = workflowIdFrom(req);
        if (!wf) {
          json(res, 400, { error: "wf query param required" });
          return;
        }
        await workflow.startCrashDemo(wf);
        json(res, 202, { accepted: true, workflowId: wf });
        return;
      }

      if (req.method === "GET" && path === "/marks") {
        const wf = workflowIdFrom(req);
        if (!wf) {
          json(res, 400, { error: "wf query param required" });
          return;
        }
        const marks = await workflow.marks(wf);
        json(res, 200, marks);
        return;
      }

      json(res, 404, { error: "not found" });
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        console.error(`[HTTP] ValidationError: ${error.message}`, error.errors);
        json(res, 400, { error: error.message, details: error.errors });
        return;
      }
      console.error(`[HTTP] Internal Error:`, error);
      json(res, 500, { error: "internal error" });
    }
  });
}
