import { describe, expect, test, afterEach, vi } from "vitest";
import { getConfig } from "../../src/config";

describe("config wiring", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
  });

  test("getConfig reads from process.env", () => {
    vi.stubEnv("PORT", "4000");
    vi.stubEnv("ADMIN_PORT", "4010");
    vi.stubEnv("DBOS_APP_NAME", "custom-app");
    vi.stubEnv("DB_HOST", "db.example.com");
    vi.stubEnv("OC_MODE", "live");
    vi.stubEnv("SBX_ALT_PROVIDER_ENABLED", "true");
    vi.stubEnv("WORKFLOW_RUNTIME_MODE", "inproc-worker");

    const cfg = getConfig();
    expect(cfg.port).toBe(4000);
    expect(cfg.adminPort).toBe(4010);
    expect(cfg.dbosAppName).toBe("custom-app");
    expect(cfg.dbHost).toBe("db.example.com");
    expect(cfg.ocMode).toBe("live");
    expect(cfg.sbxProvider).toBe("e2b");
    expect(cfg.sbxAltProviderEnabled).toBe(true);
    expect(cfg.workflowRuntimeMode).toBe("inproc-worker");
    expect(cfg.enableLegacyRunRoutes).toBe(true);
  });

  test("getConfig uses defaults", () => {
    vi.stubEnv("PORT", undefined);
    vi.stubEnv("ADMIN_PORT", undefined);
    vi.stubEnv("DBOS_APP_NAME", undefined);
    vi.stubEnv("DB_HOST", undefined);
    vi.stubEnv("OC_MODE", undefined);
    vi.stubEnv("SBX_PROVIDER", undefined);
    vi.stubEnv("SBX_DEFAULT_TIMEOUT_MS", undefined);
    vi.stubEnv("SBX_DEFAULT_NET", undefined);
    vi.stubEnv("SBX_QUEUE_CONCURRENCY", undefined);

    const cfg = getConfig();
    expect(cfg.port).toBe(3001);
    expect(cfg.adminPort).toBe(3002);
    expect(cfg.dbosAppName).toBe("sisu-kodo");
    expect(cfg.dbHost).toBe("127.0.0.1");
    expect(cfg.ocMode).toBe("replay");
    expect(cfg.sbxProvider).toBe("e2b");
    expect(cfg.sbxAltProviderEnabled).toBe(false);
    expect(cfg.sbxDefaultTimeoutMs).toBe(300000);
    expect(cfg.sbxDefaultNet).toBe(false);
    expect(cfg.workflowQueues.intentQ.concurrency).toBe(50);
    expect(cfg.workflowQueues.intentQ.partition).toBe(true);
    expect(cfg.workflowQueues.intentQ.priorityEnabled).toBe(true);
    expect(cfg.workflowQueues.sbxQ.concurrency).toBe(50);
    expect(cfg.workflowQueues.sbxQ.priorityEnabled).toBe(true);
    expect(cfg.workflowRuntimeMode).toBe("api-shim");
    expect(cfg.enableLegacyRunRoutes).toBe(true);
  });

  test("getConfig handles SBX environment overrides", () => {
    vi.stubEnv("SBX_PROVIDER", "microsandbox");
    vi.stubEnv("SBX_ALT_PROVIDER_ENABLED", "1");
    vi.stubEnv("SBX_DEFAULT_TIMEOUT_MS", "60000");
    vi.stubEnv("SBX_DEFAULT_NET", "true");
    vi.stubEnv("SBX_QUEUE_CONCURRENCY", "10");

    const cfg = getConfig();
    expect(cfg.sbxProvider).toBe("microsandbox");
    expect(cfg.sbxAltProviderEnabled).toBe(true);
    expect(cfg.sbxDefaultTimeoutMs).toBe(60000);
    expect(cfg.sbxDefaultNet).toBe(true);
    expect(cfg.workflowQueues.sbxQ.concurrency).toBe(10);
  });

  test("getConfig reads intent queue environment overrides", () => {
    vi.stubEnv("INTENT_QUEUE_CONCURRENCY", "12");
    vi.stubEnv("INTENT_QUEUE_WORKER_CONCURRENCY", "3");
    vi.stubEnv("INTENT_QUEUE_RATE_LIMIT_PER_PERIOD", "7");
    vi.stubEnv("INTENT_QUEUE_RATE_LIMIT_PERIOD_SEC", "9");
    vi.stubEnv("INTENT_QUEUE_PARTITION", "false");
    vi.stubEnv("INTENT_QUEUE_PRIORITY_ENABLED", "false");

    const cfg = getConfig();
    expect(cfg.workflowQueues.intentQ.concurrency).toBe(12);
    expect(cfg.workflowQueues.intentQ.workerConcurrency).toBe(3);
    expect(cfg.workflowQueues.intentQ.rateLimit.limitPerPeriod).toBe(7);
    expect(cfg.workflowQueues.intentQ.rateLimit.periodSec).toBe(9);
    expect(cfg.workflowQueues.intentQ.partition).toBe(false);
    expect(cfg.workflowQueues.intentQ.priorityEnabled).toBe(false);
  });

  test("getConfig reads OTLP and trace URL toggles", () => {
    vi.stubEnv("DBOS_ENABLE_OTLP", "true");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "http://traces.local");
    vi.stubEnv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "http://logs.local");
    vi.stubEnv("TRACE_BASE_URL", "https://trace.local/trace/{traceId}");

    const cfg = getConfig();
    expect(cfg.enableOTLP).toBe(true);
    expect(cfg.otlpTracesEndpoints).toEqual(["http://traces.local"]);
    expect(cfg.otlpLogsEndpoints).toEqual(["http://logs.local"]);
    expect(cfg.traceBaseUrl).toBe("https://trace.local/trace/{traceId}");
  });

  test("getConfig throws on invalid integer", () => {
    vi.stubEnv("PORT", "not-a-number");
    expect(() => getConfig()).toThrow("invalid integer env value: not-a-number");
  });

  test("getConfig throws on non-integer", () => {
    vi.stubEnv("PORT", "4000.5");
    expect(() => getConfig()).toThrow("invalid integer env value: 4000.5");
  });

  test("getConfig throws on invalid sbx provider", () => {
    vi.stubEnv("SBX_PROVIDER", "unknown");
    expect(() => getConfig()).toThrow("invalid sbx provider env value: unknown");
  });

  test("getConfig throws on invalid workflow runtime mode", () => {
    vi.stubEnv("WORKFLOW_RUNTIME_MODE", "worker");
    expect(() => getConfig()).toThrow("invalid workflow runtime mode env value: worker");
  });

  test("getConfig throws on invalid boolean", () => {
    vi.stubEnv("SBX_ALT_PROVIDER_ENABLED", "yes");
    expect(() => getConfig()).toThrow("invalid boolean env value: yes");
  });

  test("getConfig throws on invalid trace URL", () => {
    vi.stubEnv("TRACE_BASE_URL", "not-a-url");
    expect(() => getConfig()).toThrow("invalid trace base url env value: not-a-url");
  });

  test("getConfig reads legacy route gate toggle", () => {
    vi.stubEnv("ENABLE_LEGACY_RUN_ROUTES", "false");
    const cfg = getConfig();
    expect(cfg.enableLegacyRunRoutes).toBe(false);
  });

  test("getConfig reads claimScope and ocStrictMode", () => {
    vi.stubEnv("CLAIM_SCOPE", "signoff");
    vi.stubEnv("OC_STRICT_MODE", "true");
    const cfg = getConfig();
    expect(cfg.claimScope).toBe("signoff");
    expect(cfg.ocStrictMode).toBe(true);

    vi.stubEnv("CLAIM_SCOPE", "live-smoke");
    vi.stubEnv("OC_STRICT_MODE", "0");
    const cfg2 = getConfig();
    expect(cfg2.claimScope).toBe("live-smoke");
    expect(cfg2.ocStrictMode).toBe(false);

    vi.stubEnv("CLAIM_SCOPE", "unknown");
    const cfg3 = getConfig();
    expect(cfg3.claimScope).toBe("demo");
  });
});
