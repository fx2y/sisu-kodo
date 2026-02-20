import { DBOS } from "@dbos-inc/dbos-sdk";
import type { AppConfig } from "../config";

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
  if (config.otelServiceName) {
    process.env.OTEL_SERVICE_NAME = config.otelServiceName;
  }
  if (config.otelResourceAttrs) {
    const attrs = Object.entries(config.otelResourceAttrs)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    process.env.OTEL_RESOURCE_ATTRIBUTES = attrs;
  }

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
