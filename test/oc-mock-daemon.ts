import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";

export class OCMockDaemon {
  private server?: Server;
  public callCount = 0;
  private responseQueue: unknown[] = [];
  private agentResponses: Record<string, unknown[]> = {};

  constructor(private port: number = 4096) {}

  pushResponse(resp: unknown) {
    this.responseQueue.push(resp);
  }

  pushAgentResponse(agent: string, resp: unknown) {
    if (!this.agentResponses[agent]) this.agentResponses[agent] = [];
    this.agentResponses[agent].push(resp);
  }

  setNextResponse(resp: unknown) {
    this.responseQueue = [resp];
  }

  start(): Promise<void> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      this.callCount++;
      const origin = req.headers.origin;

      if (origin === "http://localhost:3000") {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }

      if (req.url === "/global/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ healthy: true }));
        return;
      }

      if (req.url === "/push-agent-response" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          const parsed = JSON.parse(body);
          this.pushAgentResponse(parsed.agent, parsed.response);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        });
        return;
      }

      if (req.url === "/doc") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            openapi: "3.1.0",
            info: { title: "OpenCode Mock", version: "1.0.0" },
            paths: {}
          })
        );
        return;
      }

      if (req.url === "/global/agents" || req.url === "/app/agents") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ id: "plan" }, { id: "build" }]));
        return;
      }

      if (req.url === "/session" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "mock-session-id" }));
        return;
      }

      if (
        (req.url?.startsWith("/session/") &&
          req.url?.endsWith("/message") &&
          req.method === "POST") ||
        (req.url?.startsWith("/session/") && req.url?.endsWith("/prompt") && req.method === "POST")
      ) {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          let agent = "plan";
          try {
            const parsed = JSON.parse(body);
            if (parsed.agent) agent = parsed.agent;
          } catch {
            // ignore
          }

          // Try agent-specific queue first
          if (this.agentResponses[agent] && this.agentResponses[agent].length > 0) {
            const out = JSON.stringify(this.agentResponses[agent].shift());
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(out);
            return;
          }

          const respFromQueue = this.responseQueue.shift();
          if (respFromQueue) {
            const out = JSON.stringify(respFromQueue);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(out);
            return;
          }

          const defaultStructured =
            agent === "build"
              ? {
                  patch: [],
                  tests: Array.from({ length: 100 }, (_, i) => `test${i}.ts`),
                  test_command: "echo running"
                }
              : {
                  goal: "default goal",
                  design: ["default design"],
                  files: ["default.ts"],
                  risks: ["none"],
                  tests: ["default.test.ts"]
                };

          const resp = {
            info: {
              id: `msg-${agent}-default`,
              structured_output: defaultStructured,
              tool_calls: []
            },
            messages: [{ type: "text", text: `mock ${agent} response` }],
            usage: { total_tokens: 100 }
          };

          const out = JSON.stringify(resp);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(out);
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    return new Promise((resolve, reject) => {
      this.server?.on("error", reject);
      this.server?.listen(this.port, "127.0.0.1", () => {
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server?.close(() => resolve());
    });
  }
}
