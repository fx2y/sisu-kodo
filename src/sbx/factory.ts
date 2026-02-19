import { getConfig } from "../config";
import type { RunInSBXPort, SBXMode } from "./port";
import { E2BProvider } from "./providers/e2b";
import { MockProvider } from "./providers/mock";

export function resolveRunInSBXPort(modeOverride?: SBXMode): RunInSBXPort {
  const cfg = getConfig();
  const mode = modeOverride ?? cfg.sbxMode;

  if (mode === "mock") {
    return new MockProvider();
  }

  if (cfg.sbxProvider === "e2b") {
    return new E2BProvider();
  }

  throw new Error(`unsupported live SBX provider: ${cfg.sbxProvider}`);
}
