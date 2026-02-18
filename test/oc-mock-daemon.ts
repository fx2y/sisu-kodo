import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";

export class OCMockDaemon {
  private server?: Server;
  public callCount = 0;

  constructor(private port: number = 4096) {}

  start(): Promise<void> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      this.callCount++;
      const origin = req.headers.origin;

      // Simple CORS
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

      if (req.url === "/session" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "mock-session-id" }));
        return;
      }

      if (req.url?.startsWith("/session/") && req.url?.endsWith("/message") && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            info: { id: "msg-1" },
            parts: [{ type: "text", text: "mock response" }]
          })
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    return new Promise((resolve) => {
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
