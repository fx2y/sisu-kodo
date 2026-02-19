import type { SBXRes } from "../contracts";

export type SBXErrCode = SBXRes["errCode"];

const retryableInfraCodes: ReadonlySet<SBXErrCode> = new Set([
  "BOOT_FAIL",
  "NET_FAIL",
  "UPLOAD_FAIL",
  "DOWNLOAD_FAIL"
]);

function includesAny(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function toErrorText(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function isRetryableInfraErrCode(code: SBXErrCode): boolean {
  return retryableInfraCodes.has(code);
}

export function normalizeProviderFailure(input: {
  exitCode?: number;
  stderr?: string;
  error?: unknown;
}): SBXErrCode {
  const errorText = toErrorText(input.error);
  const stderr = input.stderr ?? "";
  const combined = `${stderr}\n${errorText}`;

  if (
    includesAny(combined, [
      "timeout",
      "timed out",
      "etimedout",
      "command timed out",
      "deadline exceeded"
    ])
  ) {
    return "TIMEOUT";
  }

  if (includesAny(combined, ["out of memory", "oom", "killed process"])) {
    return "OOM";
  }

  if (
    includesAny(combined, [
      "enotfound",
      "econnrefused",
      "econnreset",
      "network",
      "dns",
      "socket hang up"
    ])
  ) {
    return "NET_FAIL";
  }

  if (includesAny(combined, ["upload", "write file", "filesin"])) {
    return "UPLOAD_FAIL";
  }

  if (includesAny(combined, ["download", "read file", "filesout"])) {
    return "DOWNLOAD_FAIL";
  }

  if (typeof input.exitCode === "number" && input.exitCode !== 0) {
    return "CMD_NONZERO";
  }

  return "BOOT_FAIL";
}
