import { Sandbox } from "@e2b/code-interpreter";
import type { SBXReq, SBXRes } from "../../contracts";
import { nowMs } from "../../lib/time";
import { sha256 } from "../../lib/hash";
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

        if (file.uri && file.uri.startsWith("http")) {
          const res = await fetch(file.uri);
          if (!res.ok) {
            throw new Error(`Failed to download filesIn.uri: ${file.uri} (${res.status})`);
          }
          const content = await res.text();
          await sbx.files.write(file.path, content);
          continue;
        }

        return {
          exit: 1,
          stdout: "",
          stderr: `filesIn uri upload is unsupported or invalid: ${file.uri ?? "missing uri"}`,
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

      // Simple filesOut gathering: check for common artifacts if cmd succeeded
      const filesOut: SBXRes["filesOut"] = [];
      if (errCode === "NONE") {
        try {
          // In a real app, we would use a glob or a list from the request.
          // For now, we just check if out.json exists as a placeholder for "result gathering".
          const entries = await sbx.files.list(req.workdir ?? ".");
          for (const entry of entries) {
            if (
              entry.name.endsWith(".json") ||
              entry.name.endsWith(".md") ||
              entry.name.endsWith(".patch")
            ) {
              const content = await sbx.files.read(entry.name);
              filesOut.push({
                path: entry.name,
                sha256: sha256(content),
                inline: content
              });
            }
          }
        } catch {
          // ignore gathering errors
        }
      }

      return {
        exit: cmdRes.exitCode,
        stdout: cmdRes.stdout,
        stderr: cmdRes.stderr,
        filesOut,
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
