import { DBOS } from "@dbos-inc/dbos-sdk";
import type { AppConfig } from "../config";

type DBOSRuntimeConfig = Pick<
  AppConfig,
  "dbosAppName" | "systemDatabaseUrl" | "appVersion" | "adminPort" | "enableOTLP"
>;

export function configureDBOSRuntime(config: DBOSRuntimeConfig): void {
  DBOS.setConfig({
    name: config.dbosAppName,
    systemDatabaseUrl: config.systemDatabaseUrl,
    applicationVersion: config.appVersion,
    adminPort: config.adminPort,
    runAdminServer: true,
    enableOTLP: config.enableOTLP
  });
}
