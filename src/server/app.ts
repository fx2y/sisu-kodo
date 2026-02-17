import type { Server } from "node:http";

import type { Pool } from "pg";

import { getConfig } from "../config";
import { buildHttpServer } from "./http";
import { CrashWorkflowService } from "../workflow/crashWorkflow";

export type AppHandle = {
  server: Server;
  workflow: CrashWorkflowService;
};

export async function startApp(pool: Pool): Promise<AppHandle> {
  const cfg = getConfig();
  const workflow = new CrashWorkflowService(pool, cfg.workflowSleepMs);
  await workflow.resumeIncomplete();

  const server = buildHttpServer(workflow);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(cfg.port, "127.0.0.1", () => resolve());
  });

  return { server, workflow };
}
