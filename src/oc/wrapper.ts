import type { AppConfig } from "../config";
import type { OCClientPort } from "./port";
import { OCClientFixtureAdapter } from "./client";
import type { OCToolCall } from "./schema";

const ALLOWED_TOOLS_PLAN = new Set(["read", "grep", "glob", "ls", "skill"]);
const ALLOWED_TOOLS_BUILD = new Set([...ALLOWED_TOOLS_PLAN, "edit", "write", "bash", "patch"]);

export class OCWrapper {
  private readonly client: OCClientPort;

  constructor(private readonly config: AppConfig) {
    // For now we always use the fixture adapter, but it's now config-aware
    // in the sense that the wrapper owns the lifecycle.
    this.client = new OCClientFixtureAdapter();
  }

  port(): OCClientPort {
    return {
      run: async (input) => {
        const result = await this.client.run({ mode: this.config.ocMode, ...input });
        this.assertToolAllowlist(input.agent ?? "build", result.payload.toolcalls);
        return result;
      }
    };
  }

  private assertToolAllowlist(agent: string, toolcalls: OCToolCall[]): void {
    const allowed = agent === "plan" ? ALLOWED_TOOLS_PLAN : ALLOWED_TOOLS_BUILD;
    for (const call of toolcalls) {
      if (!allowed.has(call.name)) {
        throw new Error(`tool-denied: ${call.name} for agent ${agent}`);
      }
    }
  }

  get baseUrl(): string {
    return this.config.ocBaseUrl;
  }

  get timeoutMs(): number {
    return this.config.ocTimeoutMs;
  }
}
