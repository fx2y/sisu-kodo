export type AppConfig = {
  port: number;
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
};

function readInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid integer env value: ${value}`);
  }
  return parsed;
}

export function getConfig(): AppConfig {
  const port = readInt(process.env.PORT, 3001);
  const dbHost = process.env.DB_HOST ?? "127.0.0.1";
  const dbPort = readInt(process.env.DB_PORT, 54329);
  const dbUser = process.env.DB_USER ?? "postgres";
  const dbPassword = process.env.DB_PASSWORD ?? "postgres";
  const appDbName = process.env.APP_DB_NAME ?? "app_local";
  const sysDbName = process.env.SYS_DB_NAME ?? "dbos_sys";

  const appDatabaseUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${appDbName}`;
  const systemDatabaseUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${sysDbName}`;

  return {
    port,
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
    ocMode:
      process.env.OC_MODE === "record" || process.env.OC_MODE === "live"
        ? process.env.OC_MODE
        : "replay",
    ocBaseUrl: process.env.OC_BASE_URL ?? "http://127.0.0.1:4096",
    ocServerPort: readInt(process.env.OC_SERVER_PORT, 4096),
    ocTimeoutMs: readInt(process.env.OC_TIMEOUT_MS, 300000),
    ocDocPath: process.env.OC_DOC_PATH ?? "/doc",
    sbxMode: process.env.SBX_MODE === "live" ? process.env.SBX_MODE : "mock"
  };
}
