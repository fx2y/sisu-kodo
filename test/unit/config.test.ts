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
  });

  test("getConfig uses defaults", () => {
    vi.stubEnv("PORT", undefined);
    vi.stubEnv("DB_HOST", undefined);
    vi.stubEnv("OC_MODE", undefined);

    const cfg = getConfig();
    expect(cfg.port).toBe(3001);
    expect(cfg.dbHost).toBe("127.0.0.1");
    expect(cfg.ocMode).toBe("replay");
  });
});
