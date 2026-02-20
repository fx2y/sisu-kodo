import { describe, expect, test, afterEach, vi } from "vitest";
import { getConfig } from "../../src/config";

describe("OTLP config parsing", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
  });

  test("reads OTLP endpoints as comma lists", () => {
    vi.stubEnv("DBOS_ENABLE_OTLP", "true");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "http://otel:4318/v1/traces");
    vi.stubEnv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "http://otel:4318/v1/logs");

    const cfg = getConfig();
    expect(cfg.enableOTLP).toBe(true);
    expect(cfg.otlpTracesEndpoints).toEqual(["http://otel:4318/v1/traces"]);
    expect(cfg.otlpLogsEndpoints).toEqual(["http://otel:4318/v1/logs"]);
  });

  test("handles multiple endpoints in comma list", () => {
    vi.stubEnv("DBOS_ENABLE_OTLP", "true");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "http://otel1:4318, http://otel2:4318");
    vi.stubEnv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "http://logs:4318");

    const cfg = getConfig();
    expect(cfg.otlpTracesEndpoints).toEqual(["http://otel1:4318", "http://otel2:4318"]);
  });

  test("uses OTEL_EXPORTER_OTLP_ENDPOINT as fallback", () => {
    vi.stubEnv("DBOS_ENABLE_OTLP", "true");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel:4318");

    const cfg = getConfig();
    expect(cfg.otlpTracesEndpoints).toEqual(["http://otel:4318"]);
    expect(cfg.otlpLogsEndpoints).toEqual(["http://otel:4318"]);
  });

  test("reads resource attributes", () => {
    vi.stubEnv("OTEL_SERVICE_NAME", "my-service");
    vi.stubEnv("OTEL_RESOURCE_ATTRIBUTES", "env=prod,version=1.0.0");

    const cfg = getConfig();
    expect(cfg.otelServiceName).toBe("my-service");
    expect(cfg.otelResourceAttrs).toEqual({
      env: "prod",
      version: "1.0.0"
    });
  });

  test("throws if OTLP enabled but traces endpoint missing", () => {
    vi.stubEnv("DBOS_ENABLE_OTLP", "true");
    vi.stubEnv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "http://logs:4318");
    expect(() => getConfig()).toThrow(/missing OTEL_EXPORTER_OTLP_TRACES_ENDPOINT or OTEL_EXPORTER_OTLP_LOGS_ENDPOINT/);
  });

  test("throws if OTLP enabled but logs endpoint missing", () => {
    vi.stubEnv("DBOS_ENABLE_OTLP", "true");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "http://traces:4318");
    expect(() => getConfig()).toThrow(/missing OTEL_EXPORTER_OTLP_TRACES_ENDPOINT or OTEL_EXPORTER_OTLP_LOGS_ENDPOINT/);
  });

  test("throws on invalid endpoint URL", () => {
    vi.stubEnv("DBOS_ENABLE_OTLP", "true");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "not-a-url");
    vi.stubEnv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "http://logs:4318");
    expect(() => getConfig()).toThrow(/invalid OTLP endpoint URL: not-a-url/);
  });
});
