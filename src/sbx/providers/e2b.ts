import { Sandbox } from "@e2b/code-interpreter";
import type { SBXReq, SBXRes } from "../../contracts";
import { nowMs } from "../../lib/time";
import { normalizeProviderFailure } from "../failure";
import type { RunInSBXContext, RunInSBXPort, RunInSBXOptions } from "../port";

const activeSandboxes = new Set<string>();

export function getE2BActiveSandboxCount(): number {
  return activeSandboxes.size;
}

export class E2BProvider implements RunInSBXPort {
  readonly provider = "e2b";

  async run(req: SBXReq, ctx: RunInSBXContext, options?: RunInSBXOptions): Promise<SBXRes> {
    const start = nowMs();
    let sbx: Sandbox | undefined;
    try {
      sbx = await Sandbox.create(req.envRef, {
        timeoutMs: req.timeoutMs
      });
      activeSandboxes.add(sbx.sandboxId);

      // Upload files
      for (const file of req.filesIn) {
        if (file.inline !== undefined) {
          await sbx.files.write(file.path, file.inline);
          continue;
        }

        return {
          exit: 1,
          stdout: "",
          stderr: `filesIn uri upload is unsupported in v0: ${file.path}`,
          filesOut: [],
          metrics: { wallMs: nowMs() - start, cpuMs: 0, memPeakMB: 0 },
          sandboxRef: sbx.sandboxId,
          errCode: "UPLOAD_FAIL",
          taskKey: req.taskKey,
          raw: { provider: this.provider, ctx }
        };
      }

      let seq = 0;
      const cmdRes = await sbx.commands.run(req.cmd, {
        envs: req.env,
        timeoutMs: req.timeoutMs,
        cwd: req.workdir,
        onStdout: (chunk) => options?.onChunk?.({ kind: "stdout", chunk, seq: seq++ }),
        onStderr: (chunk) => options?.onChunk?.({ kind: "stderr", chunk, seq: seq++ })
      });

      const wallMs = nowMs() - start;
      const errCode =
        cmdRes.exitCode === 0
          ? "NONE"
          : normalizeProviderFailure({
              exitCode: cmdRes.exitCode,
              stderr: cmdRes.stderr,
              error: cmdRes.error
            });

      return {
        exit: cmdRes.exitCode,
        stdout: cmdRes.stdout,
        stderr: cmdRes.stderr,
        filesOut: [], // Artifact gathering deferred to C4
        metrics: {
          wallMs,
          cpuMs: wallMs,
          memPeakMB: 0
        },
        sandboxRef: sbx.sandboxId,
        errCode,
        taskKey: req.taskKey,
        raw: {
          provider: this.provider,
          ctx,
          exitCode: cmdRes.exitCode,
          error: cmdRes.error
        }
      };
    } catch (error: unknown) {
      const wallMs = nowMs() - start;
      const message = error instanceof Error ? error.message : String(error);
      const errCode = normalizeProviderFailure({ error, stderr: message });

      return {
        exit: 1,
        stdout: "",
        stderr: message,
        filesOut: [],
        metrics: { wallMs, cpuMs: 0, memPeakMB: 0 },
        sandboxRef: "e2b-error",
        errCode,
        taskKey: req.taskKey,
        raw: {
          provider: this.provider,
          ctx,
          error: message,
          stack: error instanceof Error ? error.stack : undefined
        }
      };
    } finally {
      if (sbx) {
        try {
          await sbx.kill();
        } catch {
          // ignore cleanup errors
        }
        activeSandboxes.delete(sbx.sandboxId);
      }
    }
  }

  async health(): Promise<{ ok: boolean; provider: string }> {
    return { ok: true, provider: this.provider };
  }
}
