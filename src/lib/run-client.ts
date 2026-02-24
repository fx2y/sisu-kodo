import type { RunHeader } from "../contracts/ui/run-header.schema";
import type { RunStartRequest } from "../contracts/run-start.schema";

export type StartRunResponse = RunHeader & {
  isReplay: boolean;
};

export class RunClientError extends Error {
  constructor(
    public message: string,
    public status?: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "RunClientError";
  }
}

/**
 * Canonical client seam for starting runs.
 */
export async function startRun(request: RunStartRequest): Promise<StartRunResponse> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!res.ok) {
    let payload: any;
    try {
      payload = await res.json();
    } catch {
      throw new RunClientError(`Failed to start run: ${res.statusText}`, res.status);
    }
    throw new RunClientError(
      payload.error || payload.message || "Failed to start run",
      res.status,
      payload.code,
      payload.details ?? payload
    );
  }

  const response = (await res.json()) as Partial<StartRunResponse>;
  return {
    ...(response as RunHeader),
    isReplay: Boolean(response.isReplay)
  };
}

/**
 * Legacy start path for backward compatibility during migration.
 */
export async function startRunLegacy(goal: string): Promise<RunHeader> {
  // 1. Create Intent
  const intentRes = await fetch("/api/intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal,
      inputs: {},
      constraints: {}
    })
  });

  if (!intentRes.ok) throw new Error("Failed to create intent");
  const { intentId } = await intentRes.json();

  // 2. Start Run
  const runRes = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intentId,
      recipeName: "compile-default",
      queuePartitionKey: "ui-default"
    })
  });

  if (!runRes.ok) throw new Error("Failed to start run");
  const { header } = await runRes.json();
  return header as RunHeader;
}
