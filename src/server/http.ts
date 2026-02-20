import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { Pool } from "pg";

import type { WorkflowService } from "../workflow/port";
import { ValidationError } from "../contracts/assert";
import { QueuePolicyError } from "../workflow/queue-policy";
import {
  createIntentService,
  startRunService,
  getRunHeaderService,
  getStepRowsService,
  getArtifactService
} from "./ui-api";
import { findRunByIdOrWorkflowId, findRunSteps } from "../db/runRepo";
import { findArtifactsByRunId } from "../db/artifactRepo";
import { projectRunView } from "./run-view";
import { assertRunView } from "../contracts/run-view.schema";
import { assertRunEvent } from "../contracts/run-event.schema";
import { assertPlanApprovalRequest } from "../contracts/plan-approval.schema";
import {
  assertListWorkflowsQuery,
  assertListWorkflowsResponse
} from "../contracts/ops/list.schema";
import { assertWorkflowIdParam, assertGetWorkflowResponse } from "../contracts/ops/get.schema";
import {
  assertGetWorkflowStepsParams,
  assertGetWorkflowStepsResponse
} from "../contracts/ops/steps.schema";
import {
  assertCancelWorkflowParams,
  assertCancelWorkflowRequest,
  assertCancelWorkflowResponse
} from "../contracts/ops/cancel.schema";
import {
  assertResumeWorkflowParams,
  assertResumeWorkflowRequest,
  assertResumeWorkflowResponse
} from "../contracts/ops/resume.schema";
import {
  assertForkWorkflowParams,
  assertForkWorkflowRequest,
  assertForkWorkflowResponse
} from "../contracts/ops/fork.schema";
import { approvePlan } from "../db/planApprovalRepo";
import { findIntentById } from "../db/intentRepo";
import {
  listWorkflows as listOpsWorkflows,
  getWorkflow as getOpsWorkflow,
  getWorkflowSteps as getOpsWorkflowSteps,
  cancelWorkflow as cancelOpsWorkflow,
  resumeWorkflow as resumeOpsWorkflow,
  forkWorkflow as forkOpsWorkflow,
  OpsNotFoundError,
  OpsConflictError
} from "./ops-api";

type RetryFromStep = "CompileST" | "ApplyPatchST" | "DecideST" | "ExecuteST";

const orderedRetrySteps: RetryFromStep[] = ["CompileST", "ApplyPatchST", "DecideST", "ExecuteST"];

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value));
}

function parseJsonOrThrow(body: string): unknown {
  if (body.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ValidationError([], "invalid json");
  }
}

function resolveRetryFromStep(steps: Array<{ stepId: string }>): RetryFromStep {
  const completed = new Set(steps.map((step) => step.stepId));
  for (const stepId of orderedRetrySteps) {
    if (!completed.has(stepId)) return stepId;
  }
  return "ExecuteST";
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

      // New /api routes (Cycle C2)
      if (req.method === "POST" && path === "/api/intents") {
        const body = await readBody(req);
        let payload: unknown;
        try {
          payload = body ? JSON.parse(body) : {};
        } catch {
          json(res, 400, { error: "invalid json" });
          return;
        }
        const result = await createIntentService(pool, payload);
        json(res, 201, result);
        return;
      }

      if (req.method === "POST" && path === "/api/runs") {
        const body = await readBody(req);
        let payload: unknown;
        try {
          payload = body ? JSON.parse(body) : {};
        } catch {
          json(res, 400, { error: "invalid json" });
          return;
        }
        const payloadObj = asRecord(payload);
        if (!payloadObj) {
          json(res, 400, { error: "invalid json payload" });
          return;
        }
        const { intentId, ...runRequest } = payloadObj;
        if (typeof intentId !== "string" || intentId.length === 0) {
          json(res, 400, { error: "intentId required" });
          return;
        }
        const { header } = await startRunService(pool, workflow, intentId, runRequest);
        json(res, 202, header);
        return;
      }

      if (req.method === "GET" && path === "/api/ops/wf") {
        const query: Record<string, unknown> = {};
        for (const [key, value] of url.searchParams.entries()) {
          query[key] = key === "limit" ? Number(value) : value;
        }
        assertListWorkflowsQuery(query);
        const out = await listOpsWorkflows(workflow, query);
        assertListWorkflowsResponse(out);
        json(res, 200, out);
        return;
      }

      const apiOpsGetMatch = path.match(/^\/api\/ops\/wf\/([^/]+)$/);
      if (req.method === "GET" && apiOpsGetMatch) {
        const payload = { id: apiOpsGetMatch[1] };
        assertWorkflowIdParam(payload);
        const out = await getOpsWorkflow(workflow, payload.id);
        assertGetWorkflowResponse(out);
        json(res, 200, out);
        return;
      }

      const apiOpsStepsMatch = path.match(/^\/api\/ops\/wf\/([^/]+)\/steps$/);
      if (req.method === "GET" && apiOpsStepsMatch) {
        const payload = { id: apiOpsStepsMatch[1] };
        assertGetWorkflowStepsParams(payload);
        const out = await getOpsWorkflowSteps(workflow, payload.id);
        assertGetWorkflowStepsResponse(out);
        json(res, 200, out);
        return;
      }

      const apiOpsCancelMatch = path.match(/^\/api\/ops\/wf\/([^/]+)\/cancel$/);
      if (req.method === "POST" && apiOpsCancelMatch) {
        const body = parseJsonOrThrow(await readBody(req));
        assertCancelWorkflowRequest(body);
        const payload = { id: apiOpsCancelMatch[1] };
        assertCancelWorkflowParams(payload);
        const out = await cancelOpsWorkflow(workflow, payload.id, pool, body.actor, body.reason);
        assertCancelWorkflowResponse(out);
        json(res, 202, out);
        return;
      }

      const apiOpsResumeMatch = path.match(/^\/api\/ops\/wf\/([^/]+)\/resume$/);
      if (req.method === "POST" && apiOpsResumeMatch) {
        const body = parseJsonOrThrow(await readBody(req));
        assertResumeWorkflowRequest(body);
        const payload = { id: apiOpsResumeMatch[1] };
        assertResumeWorkflowParams(payload);
        const out = await resumeOpsWorkflow(workflow, payload.id, pool, body.actor, body.reason);
        assertResumeWorkflowResponse(out);
        json(res, 202, out);
        return;
      }

      const apiOpsForkMatch = path.match(/^\/api\/ops\/wf\/([^/]+)\/fork$/);
      if (req.method === "POST" && apiOpsForkMatch) {
        const body = parseJsonOrThrow(await readBody(req));
        assertForkWorkflowRequest(body);
        const payload = { id: apiOpsForkMatch[1] };
        assertForkWorkflowParams(payload);
        const out = await forkOpsWorkflow(
          workflow,
          payload.id,
          body,
          pool,
          body.actor,
          body.reason
        );
        assertForkWorkflowResponse(out);
        json(res, 202, out);
        return;
      }

      const apiRunMatch = path.match(/^\/api\/runs\/([^/]+)$/);
      if (req.method === "GET" && apiRunMatch) {
        const wid = apiRunMatch[1];
        const header = await getRunHeaderService(pool, workflow, wid);
        if (!header) {
          json(res, 404, { error: "run not found" });
          return;
        }
        json(res, 200, header);
        return;
      }

      const apiStepsMatch = path.match(/^\/api\/runs\/([^/]+)\/steps$/);
      if (req.method === "GET" && apiStepsMatch) {
        const wid = apiStepsMatch[1];
        const steps = await getStepRowsService(pool, workflow, wid);
        json(res, 200, steps);
        return;
      }

      const apiArtifactMatch = path.match(/^\/api\/artifacts\/(.+)$/);
      if (req.method === "GET" && apiArtifactMatch) {
        const id = decodeURIComponent(apiArtifactMatch[1]);
        const artifact = await getArtifactService(pool, id);
        if (!artifact) {
          json(res, 404, { error: "artifact not found" });
          return;
        }

        const jsonKinds = new Set(["json", "raw", "timings", "artifact_index", "question_card"]);
        const textKinds = new Set(["text", "stdout", "stderr", "none", "file"]);

        const contentType = jsonKinds.has(artifact.kind)
          ? "application/json"
          : artifact.kind === "svg"
            ? "image/svg+xml"
            : "text/plain";

        res.writeHead(200, { "content-type": contentType });
        if (artifact.inline) {
          let body: string;
          if (jsonKinds.has(artifact.kind)) {
            // For JSON kinds, we want to ensure it is valid JSON string if it's not already
            const inlineObj =
              typeof artifact.inline === "string" ? JSON.parse(artifact.inline) : artifact.inline;
            // If it's one of our wrappers like { json: ... } or { text: ... }, extract the inner value
            const finalData =
              inlineObj.json !== undefined
                ? inlineObj.json
                : inlineObj.text !== undefined
                  ? inlineObj.text
                  : inlineObj;
            body = typeof finalData === "string" ? finalData : JSON.stringify(finalData, null, 2);
          } else if (textKinds.has(artifact.kind)) {
            const inlineObj =
              typeof artifact.inline === "string" ? JSON.parse(artifact.inline) : artifact.inline;
            body =
              inlineObj.text !== undefined
                ? inlineObj.text
                : typeof inlineObj === "string"
                  ? inlineObj
                  : JSON.stringify(inlineObj, null, 2);
          } else {
            body =
              typeof artifact.inline === "string"
                ? artifact.inline
                : JSON.stringify(artifact.inline);
          }
          res.end(body);
        } else {
          // C2.T5: Fallback to metadata if no inline content
          res.end(JSON.stringify(artifact));
        }
        return;
      }

      // 1. INTENTS: POST /intents (Legacy)
      if (req.method === "POST" && path === "/intents") {
        const body = await readBody(req);
        const payload = body ? JSON.parse(body) : {};
        const result = await createIntentService(pool, payload);
        json(res, 201, result);
        return;
      }

      // 2. RUNS: POST /intents/:id/run (Legacy)
      const intentRunMatch = path.match(/^\/intents\/([^/]+)\/run$/);
      if (req.method === "POST" && intentRunMatch) {
        const intentId = intentRunMatch[1];
        const intent = await findIntentById(pool, intentId);
        if (!intent) {
          json(res, 404, { error: "intent not found" });
          return;
        }

        const body = await readBody(req);
        const reqPayload = body ? JSON.parse(body) : {};
        const { runId, workflowId } = await startRunService(pool, workflow, intentId, reqPayload);

        json(res, 202, { runId, workflowId });
        return;
      }

      // 4. RUNS: POST /runs/:id/retry (Legacy)
      const runRetryMatch = path.match(/^\/runs\/([^/]+)\/retry$/);
      if (req.method === "POST" && runRetryMatch) {
        const idOrWfId = runRetryMatch[1];
        const run = await findRunByIdOrWorkflowId(pool, idOrWfId);
        if (!run) {
          json(res, 404, { error: "run not found" });
          return;
        }
        if (run.status !== "failed" && run.status !== "retries_exceeded") {
          json(res, 409, {
            error: `cannot retry run in status ${run.status}`,
            status: run.status
          });
          return;
        }

        const fromStep = resolveRetryFromStep(await findRunSteps(pool, run.id));

        await workflow.startRepairRun(run.id);

        json(res, 202, { accepted: true, newRunId: run.id, fromStep });
        return;
      }

      // 5. RUNS: POST /runs/:id/events
      const runEventMatch = path.match(/^\/runs\/([^/]+)\/events$/);
      if (req.method === "POST" && runEventMatch) {
        const idOrWfId = runEventMatch[1];
        const run = await findRunByIdOrWorkflowId(pool, idOrWfId);
        if (!run) {
          json(res, 404, { error: "run not found" });
          return;
        }

        if (run.status !== "waiting_input") {
          json(res, 409, {
            error: `cannot send event to run in status ${run.status}`,
            status: run.status
          });
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

      // 6. RUNS: POST /runs/:id/approve-plan
      const runApproveMatch = path.match(/^\/runs\/([^/]+)\/approve-plan$/);
      if (req.method === "POST" && runApproveMatch) {
        const idOrWfId = runApproveMatch[1];
        const run = await findRunByIdOrWorkflowId(pool, idOrWfId);
        if (!run) {
          json(res, 404, { error: "run not found" });
          return;
        }

        const body = await readBody(req);
        let payload: unknown;
        try {
          payload = body ? JSON.parse(body) : {};
        } catch {
          json(res, 400, { error: "invalid json" });
          return;
        }
        assertPlanApprovalRequest(payload);

        const approvedAt = await approvePlan(pool, run.id, payload.approvedBy, payload.notes);
        if (run.status === "waiting_input") {
          await workflow.sendEvent(run.workflow_id, {
            type: "approve-plan",
            payload: { approvedBy: payload.approvedBy }
          });
        }

        json(res, 202, {
          accepted: true,
          runId: run.id,
          approvedAt: approvedAt.toISOString()
        });
        return;
      }

      // 3. RUNS: GET /runs/:id
      const runMatch = path.match(/^\/runs\/([^/]+)$/);
      if (req.method === "GET" && runMatch) {
        const idOrWfId = runMatch[1];
        const run = await findRunByIdOrWorkflowId(pool, idOrWfId);
        if (!run) {
          json(res, 404, { error: "run not found" });
          return;
        }

        const steps = await findRunSteps(pool, run.id);
        const artifacts = await findArtifactsByRunId(pool, run.id);

        const runView = projectRunView(run, steps, artifacts);

        // Gate 4: Egress validation
        assertRunView(runView);

        json(res, 200, runView);
        return;
      }

      // Legacy Crash Demo routes
      if (req.method === "POST" && path === "/api/ops/wf/sleep") {
        const wf = workflowIdFrom(req);
        if (!wf) {
          json(res, 400, { error: "wf query param required" });
          return;
        }
        const sleepMs = Number(url.searchParams.get("sleep") ?? "5000");
        await workflow.startSleepWorkflow(wf, sleepMs);
        json(res, 202, { accepted: true, workflowId: wf });
        return;
      }

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

      if (req.method === "POST" && path === "/slowstep") {
        const wf = workflowIdFrom(req);
        if (!wf) {
          json(res, 400, { error: "wf query param required" });
          return;
        }
        const sleepMs = Number(url.searchParams.get("sleep") ?? "5000");
        await workflow.startSlowStep(wf, sleepMs);
        json(res, 202, { accepted: true, workflowId: wf });
        return;
      }

      if (req.method === "GET" && path === "/slowmarks") {
        const wf = workflowIdFrom(req);
        if (!wf) {
          json(res, 400, { error: "wf query param required" });
          return;
        }
        const marks = await workflow.getSlowMarks(wf);
        json(res, 200, marks);
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
        if (error.message === "invalid json") {
          json(res, 400, { error: "invalid json" });
          return;
        }
        console.error(`[HTTP] ValidationError: ${error.message}`, error.errors);
        json(res, 400, { error: error.message, details: error.errors });
        return;
      }
      if (error instanceof Error && error.message.includes("Intent not found")) {
        json(res, 404, { error: error.message });
        return;
      }
      if (error instanceof QueuePolicyError) {
        json(res, 400, { error: error.message, code: error.code });
        return;
      }
      if (error instanceof OpsNotFoundError) {
        json(res, 404, { error: error.message });
        return;
      }
      if (error instanceof OpsConflictError) {
        json(res, 409, { error: error.message });
        return;
      }
      console.error(`[HTTP] Internal Error:`, error);
      json(res, 500, { error: "internal error" });
    }
  });
}
