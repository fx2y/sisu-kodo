import { describe, expect, test } from "vitest";
import { isRetryableInfraErrCode, normalizeProviderFailure } from "../../src/sbx/failure";

describe("sbx failure normalization", () => {
  test("maps known failure classes to stable errCode", () => {
    expect(normalizeProviderFailure({ error: "ETIMEDOUT command exceeded timeout" })).toBe(
      "TIMEOUT"
    );
    expect(normalizeProviderFailure({ error: "OOM killed process 9" })).toBe("OOM");
    expect(normalizeProviderFailure({ error: "ENOTFOUND api.e2b.dev" })).toBe("NET_FAIL");
    expect(normalizeProviderFailure({ error: "upload failed during filesIn write" })).toBe(
      "UPLOAD_FAIL"
    );
    expect(normalizeProviderFailure({ error: "download artifact failed" })).toBe("DOWNLOAD_FAIL");
    expect(normalizeProviderFailure({ exitCode: 1, stderr: "test failed" })).toBe("CMD_NONZERO");
  });

  test("retry matrix is infra-only", () => {
    expect(isRetryableInfraErrCode("BOOT_FAIL")).toBe(true);
    expect(isRetryableInfraErrCode("NET_FAIL")).toBe(true);
    expect(isRetryableInfraErrCode("UPLOAD_FAIL")).toBe(true);
    expect(isRetryableInfraErrCode("DOWNLOAD_FAIL")).toBe(true);
    expect(isRetryableInfraErrCode("CMD_NONZERO")).toBe(false);
    expect(isRetryableInfraErrCode("TIMEOUT")).toBe(false);
    expect(isRetryableInfraErrCode("OOM")).toBe(false);
  });
});
