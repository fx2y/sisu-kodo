export type AppConfig = {
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
  sbxQueue: {
    workerConcurrency: number;
    concurrency: number;
    rateLimit: {
      limitPerPeriod: number;
      periodSec: number;
    };
    partition: boolean;
  };
  rngSeed?: number;
  enableOTLP: boolean;
  traceBaseUrl?: string;
};

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

  return {
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
    sbxQueue: {
      workerConcurrency: readInt(process.env.SBX_QUEUE_WORKER_CONCURRENCY, 10),
      concurrency: readInt(process.env.SBX_QUEUE_CONCURRENCY, 50),
      rateLimit: {
        limitPerPeriod: readInt(process.env.SBX_QUEUE_RATE_LIMIT_PER_PERIOD, 100),
        periodSec: readInt(process.env.SBX_QUEUE_RATE_LIMIT_PERIOD_SEC, 60)
      },
      partition: readBool(process.env.SBX_QUEUE_PARTITION, true)
    },
    rngSeed: process.env.RANDOM_SEED ? readInt(process.env.RANDOM_SEED, 0) : undefined,
    enableOTLP: readBool(process.env.DBOS_ENABLE_OTLP, false),
    traceBaseUrl: readOptionalHttpUrl(process.env.TRACE_BASE_URL, "trace base url")
  };
}
