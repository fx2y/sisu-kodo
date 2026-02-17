export type AppConfig = {
  port: number;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  appDbName: string;
  sysDbName: string;
  workflowSleepMs: number;
  ocMode: "replay" | "record" | "live";
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
  return {
    port: readInt(process.env.PORT, 3001),
    dbHost: process.env.DB_HOST ?? "127.0.0.1",
    dbPort: readInt(process.env.DB_PORT, 54329),
    dbUser: process.env.DB_USER ?? "postgres",
    dbPassword: process.env.DB_PASSWORD ?? "postgres",
    appDbName: process.env.APP_DB_NAME ?? "app_local",
    sysDbName: process.env.SYS_DB_NAME ?? "dbos_sys",
    workflowSleepMs: readInt(process.env.WF_SLEEP_MS, 5000),
    ocMode:
      process.env.OC_MODE === "record" || process.env.OC_MODE === "live"
        ? process.env.OC_MODE
        : "replay",
    sbxMode: process.env.SBX_MODE === "live" ? process.env.SBX_MODE : "mock"
  };
}
