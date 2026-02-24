export type AppConfig = {
  workflowQueues: {
    intentQ: {
      workerConcurrency: number;
      concurrency: number;
      rateLimit: {
        limitPerPeriod: number;
        periodSec: number;
      };
      partition: boolean;
      priorityEnabled: boolean;
    };
    sbxQ: {
      workerConcurrency: number;
      concurrency: number;
      rateLimit: {
        limitPerPeriod: number;
        periodSec: number;
      };
      partition: boolean;
      priorityEnabled: boolean;
    };
  };
  port: number;
  adminPort: number;
  dbosAppName: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  appDbName: string;
  sysDbName: string;
  appDatabaseUrl: string;
  systemDatabaseUrl: string;
  appVersion: string;
  workflowRuntimeMode: "api-shim" | "inproc-worker";
  workflowSleepMs: number;
  chaosSleepExecuteMs: number;
  ocMode: "replay" | "record" | "live";
  ocBaseUrl: string;
  ocServerPort: number;
  ocTimeoutMs: number;
  ocDocPath: string;
  sbxMode: "mock" | "live";
  sbxProvider: "e2b" | "microsandbox";
  sbxAltProviderEnabled: boolean;
  sbxDefaultTimeoutMs: number;
  sbxDefaultNet: boolean;
  hitlPlanApprovalTimeoutS: number;
  rngSeed?: number;
  enableOTLP: boolean;
  otlpTracesEndpoints: string[];
  otlpLogsEndpoints: string[];
  otelServiceName?: string;
  otelResourceAttrs?: Record<string, string>;
  traceBaseUrl?: string;
  enableLegacyRunRoutes: boolean;
  claimScope: "signoff" | "demo" | "live-smoke";
  ocStrictMode: boolean;
};

export function deriveClaimScope(): "signoff" | "demo" | "live-smoke" {
  if (process.env.CLAIM_SCOPE === "signoff") return "signoff";
  if (process.env.CLAIM_SCOPE === "live-smoke") return "live-smoke";
  return "demo";
}

export function applyProcessEnvFromConfig(
  config: Pick<AppConfig, "otelServiceName" | "otelResourceAttrs">
): void {
  if (config.otelServiceName) {
    process.env.OTEL_SERVICE_NAME = config.otelServiceName;
  }
  if (config.otelResourceAttrs) {
    const attrs = Object.entries(config.otelResourceAttrs)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    process.env.OTEL_RESOURCE_ATTRIBUTES = attrs;
  }
}

function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`invalid integer env value: ${value}`);
  }
  return parsed;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  const normalized = value.toLowerCase();
  if (normalized === "true" || value === "1") return true;
  if (normalized === "false" || value === "0") return false;
  throw new Error(`invalid boolean env value: ${value}`);
}

function readQueueConfig(
  prefix: string,
  defaults: {
    workerConcurrency: number;
    concurrency: number;
    rateLimit: { limitPerPeriod: number; periodSec: number };
    partition: boolean;
    priorityEnabled: boolean;
  }
) {
  return {
    workerConcurrency: readInt(
      process.env[`${prefix}_WORKER_CONCURRENCY`],
      defaults.workerConcurrency
    ),
    concurrency: readInt(process.env[`${prefix}_CONCURRENCY`], defaults.concurrency),
    rateLimit: {
      limitPerPeriod: readInt(
        process.env[`${prefix}_RATE_LIMIT_PER_PERIOD`],
        defaults.rateLimit.limitPerPeriod
      ),
      periodSec: readInt(
        process.env[`${prefix}_RATE_LIMIT_PERIOD_SEC`],
        defaults.rateLimit.periodSec
      )
    },
    partition: readBool(process.env[`${prefix}_PARTITION`], defaults.partition),
    priorityEnabled: readBool(process.env[`${prefix}_PRIORITY_ENABLED`], defaults.priorityEnabled)
  };
}

function readEnum<T extends string>(
  value: string | undefined,
  fallback: T,
  allowed: readonly T[],
  label: string
): T {
  if (value === undefined || value === "") return fallback;
  if (allowed.includes(value as T)) {
    return value as T;
  }
  throw new Error(`invalid ${label} env value: ${value}`);
}

function readOptionalHttpUrl(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  const probe = trimmed.replaceAll("{traceId}", "trace-id").replaceAll("{spanId}", "span-id");

  let parsed: URL;
  try {
    parsed = new URL(probe);
  } catch {
    throw new Error(`invalid ${label} env value: ${value}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`invalid ${label} env value: ${value}`);
  }
  return trimmed;
}

function readCommaList(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function parseResourceAttrs(value: string | undefined): Record<string, string> | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const res: Record<string, string> = {};
  value.split(",").forEach((part) => {
    const [k, v] = part.split("=");
    if (k && v) {
      res[k.trim()] = v.trim();
    }
  });
  return Object.keys(res).length > 0 ? res : undefined;
}

export function getConfig(): AppConfig {
  const port = readInt(process.env.PORT, 3001);
  const adminPort = readInt(process.env.ADMIN_PORT, 3002);
  const dbHost = process.env.DB_HOST ?? "127.0.0.1";
  const dbPort = readInt(process.env.DB_PORT, 54329);
  const dbUser = process.env.DB_USER ?? "postgres";
  const dbPassword = process.env.DB_PASSWORD ?? "postgres";
  const appDbName = process.env.APP_DB_NAME ?? "app_local";
  const sysDbName = process.env.SYS_DB_NAME ?? "dbos_sys";

  if (process.env.TEST_SUITE) {
    console.log(`[CONFIG] APP_DB_NAME=${appDbName} TEST_SUITE=${process.env.TEST_SUITE}`);
  }

  const appDatabaseUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${appDbName}`;
  const systemDatabaseUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${sysDbName}`;

  const enableOTLP = readBool(process.env.DBOS_ENABLE_OTLP, false);
  const globalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const otlpTracesEndpoints = readCommaList(
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || globalEndpoint
  );
  const otlpLogsEndpoints = readCommaList(
    process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || globalEndpoint
  );

  if (enableOTLP) {
    if (otlpTracesEndpoints.length === 0 || otlpLogsEndpoints.length === 0) {
      throw new Error(
        "OTLP enabled but missing OTEL_EXPORTER_OTLP_TRACES_ENDPOINT or OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"
      );
    }
    // Basic validation of URLs in lists
    [...otlpTracesEndpoints, ...otlpLogsEndpoints].forEach((url) => {
      try {
        const p = new URL(url);
        if (p.protocol !== "http:" && p.protocol !== "https:") throw new Error();
      } catch {
        throw new Error(`invalid OTLP endpoint URL: ${url}`);
      }
    });
  }

  return {
    workflowQueues: {
      intentQ: readQueueConfig("INTENT_QUEUE", {
        workerConcurrency: 5,
        concurrency: 50,
        rateLimit: {
          limitPerPeriod: 100,
          periodSec: 60
        },
        partition: true,
        priorityEnabled: true
      }),
      sbxQ: readQueueConfig("SBX_QUEUE", {
        workerConcurrency: 10,
        concurrency: 50,
        rateLimit: {
          limitPerPeriod: 100,
          periodSec: 60
        },
        partition: true,
        priorityEnabled: true
      })
    },
    port,
    adminPort,
    dbosAppName: process.env.DBOS_APP_NAME ?? "sisu-kodo",
    dbHost,
    dbPort,
    dbUser,
    dbPassword,
    appDbName,
    sysDbName,
    appDatabaseUrl,
    systemDatabaseUrl,
    appVersion: process.env.DBOS__APPVERSION ?? "v1",
    workflowRuntimeMode: readEnum(
      process.env.WORKFLOW_RUNTIME_MODE,
      "api-shim",
      ["api-shim", "inproc-worker"],
      "workflow runtime mode"
    ),
    workflowSleepMs: readInt(process.env.WF_SLEEP_MS, 5000),
    chaosSleepExecuteMs: readInt(process.env.CHAOS_SLEEP_EXECUTE, 0),
    ocMode: readEnum(process.env.OC_MODE, "replay", ["replay", "record", "live"], "oc mode"),
    ocServerPort: readInt(process.env.OC_SERVER_PORT, 4096),
    ocBaseUrl: process.env.OC_BASE_URL ?? `http://127.0.0.1:${process.env.OC_SERVER_PORT ?? 4096}`,
    ocTimeoutMs: readInt(process.env.OC_TIMEOUT_MS, 300000),
    ocDocPath: process.env.OC_DOC_PATH ?? "/doc",
    sbxMode: readEnum(process.env.SBX_MODE, "mock", ["mock", "live"], "sbx mode"),
    sbxProvider: readEnum(process.env.SBX_PROVIDER, "e2b", ["e2b", "microsandbox"], "sbx provider"),
    sbxAltProviderEnabled: readBool(process.env.SBX_ALT_PROVIDER_ENABLED, false),
    sbxDefaultTimeoutMs: readInt(process.env.SBX_DEFAULT_TIMEOUT_MS, 300000),
    sbxDefaultNet: readBool(process.env.SBX_DEFAULT_NET, false),
    hitlPlanApprovalTimeoutS: readInt(process.env.HITL_PLAN_APPROVAL_TIMEOUT_S, 3600),
    rngSeed: process.env.RANDOM_SEED ? readInt(process.env.RANDOM_SEED, 0) : undefined,
    enableOTLP,
    otlpTracesEndpoints,
    otlpLogsEndpoints,
    otelServiceName: process.env.OTEL_SERVICE_NAME,
    otelResourceAttrs: parseResourceAttrs(process.env.OTEL_RESOURCE_ATTRIBUTES),
    traceBaseUrl: readOptionalHttpUrl(process.env.TRACE_BASE_URL, "trace base url"),
    enableLegacyRunRoutes: readBool(process.env.ENABLE_LEGACY_RUN_ROUTES, true),
    claimScope: deriveClaimScope(),
    ocStrictMode: readBool(process.env.OC_STRICT_MODE, false)
  };
}
