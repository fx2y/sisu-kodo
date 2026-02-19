import { insertArtifact } from "../db/artifactRepo";
import { getPool } from "../db/pool";
import { WorkflowError } from "../contracts/error";
import { nowMs, nowIso, toIso } from "../lib/time";
import { sha256 } from "../lib/hash";
import { buildArtifactUri } from "../lib/artifact-uri";

export class StallDetector {
  private lastActivity: number = nowMs();
  private interval: NodeJS.Timeout | null = null;
  private idx = 999;

  constructor(
    private readonly runId: string,
    private readonly stepId: string,
    private readonly timeoutMs: number = 30000,
    private readonly heartbeatMs: number = 5000
  ) {}

  start() {
    this.lastActivity = nowMs();
    this.interval = setInterval(async () => {
      try {
        const content = {
          ts: nowIso(),
          lastActivity: toIso(this.lastActivity),
          status: "active"
        };
        await insertArtifact(getPool(), this.runId, this.stepId, this.idx, {
          kind: "json",
          uri: buildArtifactUri({
            runId: this.runId,
            stepId: this.stepId,
            taskKey: "",
            name: "stall_heartbeat.json"
          }),
          inline: content,
          sha256: sha256(content)
        });
      } catch (_err) {
        // Ignore DB errors in heartbeat
      }
    }, this.heartbeatMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  heartbeat() {
    this.lastActivity = nowMs();
  }

  async race<T>(promise: Promise<T>): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      const check = () => {
        const now = nowMs();
        const diff = now - this.lastActivity;
        if (diff > this.timeoutMs) {
          reject(new WorkflowError("oc_stall", `No activity detected for ${this.timeoutMs}ms`));
        } else {
          const nextCheck = Math.max(10, Math.min(1000, this.timeoutMs - diff + 10));
          timeoutId = setTimeout(check, nextCheck);
        }
      };
      const initialCheck = Math.max(10, Math.min(1000, this.timeoutMs + 10));
      timeoutId = setTimeout(check, initialCheck);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
