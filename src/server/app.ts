import type { Server } from "node:http";

import type { Pool } from "pg";

import { getConfig } from "../config";
import { buildHttpServer } from "./http";
import type { WorkflowService } from "../workflow/port";

export type AppHandle = {
  server: Server;
  workflow: WorkflowService;
};

export async function startApp(pool: Pool, workflow: WorkflowService): Promise<AppHandle> {
  const cfg = getConfig();
  const server = buildHttpServer(pool, workflow);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(cfg.port, "127.0.0.1", () => resolve());
  });

  return { server, workflow };
}
