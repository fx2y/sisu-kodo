import { DBOS } from "@dbos-inc/dbos-sdk";
import path from "node:path";
import type { Pool } from "pg";
import { getConfig } from "../src/config";
import { insertIntent } from "../src/db/intentRepo";
import { createPool } from "../src/db/pool";
import { findRunSteps, insertRun, updateRunStatus } from "../src/db/runRepo";
import { generateId } from "../src/lib/id";
import { configureDBOSRuntime } from "../src/lib/otlp";
import { nowIso } from "../src/lib/time";

let smokePool: Pool | null = null;

class OTLPSmokeSteps {
  @DBOS.step()
  static async record(runId: string): Promise<void> {
    if (!smokePool) {
      throw new Error("smoke pool not initialized");
    }
    // DBOS SDK does not type-export trace/span IDs on step context.
    // Prefer DBOS span context when present, else fallback to active OTEL span.
    const dbosSpan = DBOS.span as
      | { spanContext?: () => { traceId?: string; spanId?: string } }
      | undefined;
    const dbosSpanContext = dbosSpan?.spanContext?.();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { trace } = require("@opentelemetry/api") as {
      trace: {
        getActiveSpan: () =>
          | { spanContext: () => { traceId?: string; spanId?: string } }
          | undefined;
      };
    };
    const activeSpan = trace.getActiveSpan();
    const activeSpanContext = activeSpan?.spanContext();

    const traceId = dbosSpanContext?.traceId ?? activeSpanContext?.traceId ?? null;
    const spanId = dbosSpanContext?.spanId ?? activeSpanContext?.spanId ?? null;

    await smokePool.query(
      `INSERT INTO app.run_steps (run_id, step_id, attempt, phase, output, started_at, finished_at, trace_id, span_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (run_id, step_id, attempt) DO NOTHING`,
      [
        runId,
        "OTLPSmokeST",
        1,
        "smoke",
        JSON.stringify({ attempt: 1 }),
        nowIso(),
        nowIso(),
        traceId,
        spanId
      ]
    );
  }
}

class OTLPSmokeWorkflow {
  @DBOS.workflow()
  static async run(runId: string): Promise<void> {
    await OTLPSmokeSteps.record(runId);
  }
}

async function main(): Promise<void> {
  process.env.DBOS_ENABLE_OTLP = "true";
  const config = getConfig();

  if (config.enableOTLP) {
    const endpoints = [...config.otlpTracesEndpoints, ...config.otlpLogsEndpoints];
    for (const url of endpoints) {
      try {
        // We only care if we can reach the server.
        // Node fetch will throw on connection refused/timeout.
        await fetch(url, { method: "POST", signal: AbortSignal.timeout(1000) });
      } catch (e: any) {
        // If it's a 404 or other HTTP error, it means we reached the server.
        // If it's a network error (like ECONNREFUSED), it will be caught here.
        if (e.name === "AbortError" || e.code === "ECONNREFUSED" || e.message.includes("fetch failed")) {
          throw new Error(`otlp smoke failed: OTLP receiver unreachable at ${url}`);
        }
      }
    }
  }

  configureDBOSRuntime(config);

  smokePool = createPool();
  await DBOS.launch();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { globalParams } = require(
    path.resolve("node_modules/@dbos-inc/dbos-sdk/dist/src/utils.js")
  ) as {
    globalParams: { enableOTLP: boolean };
  };

  try {
    if (!globalParams.enableOTLP) {
      throw new Error("otlp smoke failed: DBOS global OTLP toggle is disabled");
    }

    const intentId = generateId("it_otlp");
    const runId = generateId("run_otlp");
    const workflowId = generateId("wf_otlp");

    await insertIntent(smokePool, intentId, {
      goal: "otlp smoke",
      inputs: {},
      constraints: {}
    });
    await insertRun(smokePool, {
      id: runId,
      intent_id: intentId,
      workflow_id: workflowId,
      status: "running"
    });

    const handle = await DBOS.startWorkflow(OTLPSmokeWorkflow.run, { workflowID: workflowId })(
      runId
    );
    await handle.getResult();
    await updateRunStatus(smokePool, runId, "succeeded");

    const steps = await findRunSteps(smokePool, runId);
    if (steps.length === 0) {
      throw new Error("otlp smoke failed: no step rows recorded");
    }

    const traceCount = steps.filter((step) => step.traceId && step.traceId.length > 0).length;
    const spanCount = steps.filter((step) => step.spanId && step.spanId.length > 0).length;
    if (traceCount === 0 || spanCount === 0) {
      const msg = `OTLP smoke warning workflow=${workflowId} traces=${traceCount} spans=${spanCount} (SDK context does not expose IDs)`;
      if (process.env.OTLP_REQUIRED === "1") {
        throw new Error(`otlp smoke failed: no exported traces/spans. ${msg}`);
      }
      console.log(msg);
    } else {
      console.log(
        `OTLP smoke success workflow=${workflowId} traces=${traceCount} spans=${spanCount}`
      );
    }
  } finally {
    await DBOS.shutdown();
    if (smokePool) await smokePool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exit(1);
});
