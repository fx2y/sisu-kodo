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
    vi.stubEnv("DB_HOST", "db.example.com");
    vi.stubEnv("OC_MODE", "live");

    const cfg = getConfig();
    expect(cfg.port).toBe(4000);
    expect(cfg.dbHost).toBe("db.example.com");
    expect(cfg.ocMode).toBe("live");
    expect(cfg.sbxProvider).toBe("e2b");
  });

  test("getConfig uses defaults", () => {
    vi.stubEnv("PORT", undefined);
    vi.stubEnv("DB_HOST", undefined);
    vi.stubEnv("OC_MODE", undefined);
    vi.stubEnv("SB_PROVIDER", undefined);
    vi.stubEnv("SBX_DEFAULT_TIMEOUT_MS", undefined);
    vi.stubEnv("SBX_DEFAULT_NET", undefined);
    vi.stubEnv("SBX_QUEUE_CONCURRENCY", undefined);

    const cfg = getConfig();
    expect(cfg.port).toBe(3001);
    expect(cfg.dbHost).toBe("127.0.0.1");
    expect(cfg.ocMode).toBe("replay");
    expect(cfg.sbxProvider).toBe("e2b");
    expect(cfg.sbxDefaultTimeoutMs).toBe(300000);
    expect(cfg.sbxDefaultNet).toBe(false);
    expect(cfg.sbxQueue.concurrency).toBe(50);
  });

  test("getConfig handles SBX environment overrides", () => {
    vi.stubEnv("SBX_PROVIDER", "microsandbox");
    vi.stubEnv("SBX_DEFAULT_TIMEOUT_MS", "60000");
    vi.stubEnv("SBX_DEFAULT_NET", "true");
    vi.stubEnv("SBX_QUEUE_CONCURRENCY", "10");

    const cfg = getConfig();
    expect(cfg.sbxProvider).toBe("microsandbox");
    expect(cfg.sbxDefaultTimeoutMs).toBe(60000);
    expect(cfg.sbxDefaultNet).toBe(true);
    expect(cfg.sbxQueue.concurrency).toBe(10);
  });

  test("getConfig throws on invalid integer", () => {
    vi.stubEnv("PORT", "not-a-number");
    expect(() => getConfig()).toThrow("invalid integer env value: not-a-number");
  });

  test("getConfig throws on non-integer", () => {
    vi.stubEnv("PORT", "4000.5");
    expect(() => getConfig()).toThrow("invalid integer env value: 4000.5");
  });
});
