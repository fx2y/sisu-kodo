import { DBOS } from "@dbos-inc/dbos-sdk";
import { applyProcessEnvFromConfig, type AppConfig } from "../config";

type DBOSRuntimeConfig = Pick<
  AppConfig,
  | "dbosAppName"
  | "systemDatabaseUrl"
  | "appVersion"
  | "adminPort"
  | "enableOTLP"
  | "otlpTracesEndpoints"
  | "otlpLogsEndpoints"
  | "otelServiceName"
  | "otelResourceAttrs"
>;

export function configureDBOSRuntime(config: DBOSRuntimeConfig): void {
  applyProcessEnvFromConfig(config);

  DBOS.setConfig({
    name: config.dbosAppName,
    systemDatabaseUrl: config.systemDatabaseUrl,
    applicationVersion: config.appVersion,
    adminPort: config.adminPort,
    runAdminServer: true,
    enableOTLP: config.enableOTLP,
    otlpTracesEndpoints: config.otlpTracesEndpoints,
    otlpLogsEndpoints: config.otlpLogsEndpoints
  });
}
