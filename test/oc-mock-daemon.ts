import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";

export class OCMockDaemon {
  private server?: Server;
  public callCount = 0;
  private responseQueue: unknown[] = [];

  constructor(private port: number = 4096) {}

  pushResponse(resp: unknown) {
    this.responseQueue.push(resp);
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
        res.writeHead(200, { "Content-Type": "application/json" });
        const resp = this.responseQueue.shift() || {
          info: {
            id: "msg-default",
            structured_output: {
              goal: "default goal",
              design: ["default design"],
              files: ["default.ts"],
              risks: ["none"],
              tests: ["default.test.ts"]
            },
            tool_calls: []
          },
          messages: [{ type: "text", text: "mock response" }],
          usage: { total_tokens: 100 }
        };
        res.end(JSON.stringify(resp));
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
