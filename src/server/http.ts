import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { WorkflowService } from "../workflow/port";

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function workflowIdFrom(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const id = url.searchParams.get("wf");
  return id && id.trim().length > 0 ? id : null;
}

export function buildHttpServer(workflow: WorkflowService) {
  return createServer(async (req, res) => {
    if (!req.url || !req.method) {
      json(res, 400, { error: "bad request" });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/healthz")) {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url.startsWith("/crashdemo")) {
      const wf = workflowIdFrom(req);
      if (!wf) {
        json(res, 400, { error: "wf query param required" });
        return;
      }
      await workflow.trigger(wf);
      json(res, 202, { accepted: true, workflowId: wf });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/marks")) {
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
  });
}
