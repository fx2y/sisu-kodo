import type { AppConfig } from "../config";
import { getConfig } from "../config";
import type { RunInSBXPort, SBXMode } from "./port";
import { E2BProvider } from "./providers/e2b";
import { MicrosandboxProvider } from "./providers/microsandbox";
import { MockProvider } from "./providers/mock";

type SBXFactoryConfig = Pick<AppConfig, "sbxMode" | "sbxProvider" | "sbxAltProviderEnabled">;

function resolveLiveProvider(cfg: SBXFactoryConfig): RunInSBXPort {
  if (cfg.sbxProvider === "e2b") {
    return new E2BProvider();
  }

  if (cfg.sbxProvider === "microsandbox") {
    if (!cfg.sbxAltProviderEnabled) {
      throw new Error(`microsandbox provider is disabled; set SBX_ALT_PROVIDER_ENABLED=true`);
    }
    return new MicrosandboxProvider();
  }

  throw new Error(`unsupported live SBX provider: ${cfg.sbxProvider}`);
}

export function resolveRunInSBXPort(
  modeOverride?: SBXMode,
  cfgOverride?: SBXFactoryConfig
): RunInSBXPort {
  const cfg = cfgOverride ?? getConfig();
  const mode = modeOverride ?? cfg.sbxMode;

  if (mode === "mock") {
    return new MockProvider();
  }

  return resolveLiveProvider(cfg);
}
