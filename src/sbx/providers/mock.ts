import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SBXReq, SBXRes } from "../../contracts";
import { sha256 } from "../../lib/hash";
import { nowMs } from "../../lib/time";
import { normalizeProviderFailure } from "../failure";
import type { RunInSBXContext, RunInSBXPort, RunInSBXOptions } from "../port";
import { isArtifactUri } from "../../lib/artifact-uri";

let mockInjectedFailCount = 0;
const localShellActivePids = new Set<number>();

export function resetMockInjectedFailCount(): void {
  mockInjectedFailCount = 0;
}

export function getLocalShellActiveCount(): number {
  return localShellActivePids.size;
}

export class MockProvider implements RunInSBXPort {
  readonly provider = "mock";

  async run(req: SBXReq, ctx: RunInSBXContext, options?: RunInSBXOptions): Promise<SBXRes> {
    const rootCmd = req.cmd.trim().split(/\s+/, 1)[0] ?? "";

    if (rootCmd === "INFRA_FAIL") {
      return {
        exit: 1,
        stdout: "",
        stderr: "Injected infra failure",
        filesOut: [],
        metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 1 },
        sandboxRef: "mock-runner-fail",
        errCode: "BOOT_FAIL",
        taskKey: req.taskKey,
        raw: { injected: true, provider: this.provider, ctx }
      };
    }

    if (rootCmd === "FAIL_ME") {
      return {
        exit: 1,
        stdout: "",
        stderr: "Simulated command failure",
        filesOut: [],
        metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 1 },
        sandboxRef: "mock-runner-fail",
        errCode: "CMD_NONZERO",
        taskKey: req.taskKey,
        raw: { injected: true, provider: this.provider, ctx }
      };
    }

    if (rootCmd === "FLAKY_INFRA_FAIL" && mockInjectedFailCount < 2) {
      mockInjectedFailCount++;
      return {
        exit: 1,
        stdout: "",
        stderr: `Injected flaky infra failure ${mockInjectedFailCount}`,
        filesOut: [],
        metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 1 },
        sandboxRef: "mock-runner-flaky-fail",
        errCode: "BOOT_FAIL",
        taskKey: req.taskKey,
        raw: { injected: true, provider: this.provider, attempt: mockInjectedFailCount, ctx }
      };
    }

    if (rootCmd === "TIMEOUT_ME") {
      return {
        exit: 1,
        stdout: "",
        stderr: "Execution timed out",
        filesOut: [],
        metrics: { wallMs: req.timeoutMs, cpuMs: 1, memPeakMB: 1 },
        sandboxRef: "mock-runner-timeout",
        errCode: "TIMEOUT",
        taskKey: req.taskKey,
        raw: { injected: true, provider: this.provider, ctx }
      };
    }

    let seq = 0;
    const stdout = `OK: ${req.cmd}\n`;
    options?.onChunk?.({ kind: "stdout", chunk: stdout, seq: seq++ });

    const mockContent = "{}";
    return {
      exit: 0,
      stdout,
      stderr: "",
      filesOut: [
        {
          path: "out.json",
          sha256: sha256(mockContent),
          inline: mockContent
        }
      ],
      metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 1 },
      sandboxRef: "mock-runner",
      errCode: "NONE",
      taskKey: req.taskKey,
      raw: { mock: true, provider: this.provider, ctx }
    };
  }

  async health(): Promise<{ ok: boolean; provider: string }> {
    return { ok: true, provider: this.provider };
  }
}

export class LocalShellProvider implements RunInSBXPort {
  readonly provider = "local-shell";

  constructor(private readonly baseEnv: NodeJS.ProcessEnv = {} as NodeJS.ProcessEnv) {}

  async run(req: SBXReq, ctx: RunInSBXContext, options?: RunInSBXOptions): Promise<SBXRes> {
    const start = nowMs();

    // Process filesIn
    for (const file of req.filesIn) {
      if (file.inline !== undefined) {
        if (req.workdir) {
          const fullPath = path.resolve(req.workdir, file.path);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, file.inline);
        }
        continue;
      }

      if (file.uri && isArtifactUri(file.uri)) {
        if (!options?.resolveArtifact) {
          return {
            exit: 1,
            stdout: "",
            stderr: `Cannot resolve artifact URI without resolver: ${file.uri}`,
            filesOut: [],
            metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 0 },
            sandboxRef: "local-process",
            errCode: "UPLOAD_FAIL",
            taskKey: req.taskKey,
            raw: { ctx, provider: this.provider }
          };
        }
        const artifact = await options.resolveArtifact(file.uri);
        const content =
          typeof artifact.inline === "string"
            ? artifact.inline
            : JSON.stringify(artifact.inline ?? "");

        if (req.workdir) {
          const fullPath = path.resolve(req.workdir, file.path);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
        }
        continue;
      }

      return {
        exit: 1,
        stdout: "",
        stderr: `filesIn entry has unsupported URI or missing payload: ${file.path}`,
        filesOut: [],
        metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 0 },
        sandboxRef: "local-process",
        errCode: "UPLOAD_FAIL",
        taskKey: req.taskKey,
        raw: { ctx, provider: this.provider }
      };
    }

    return await new Promise<SBXRes>((resolve) => {
      const child = exec(
        req.cmd,
        { env: { ...this.baseEnv, ...req.env }, timeout: req.timeoutMs, cwd: req.workdir },
        (error, stdout, stderr) => {
          const wallMs = nowMs() - start;
          const cleanStdout = stdout.replace(/\r\n/g, "\n");
          const cleanStderr = stderr.replace(/\r\n/g, "\n");
          const exitCode = error ? (typeof error.code === "number" ? error.code : 1) : 0;
          let errCode: SBXRes["errCode"] = "NONE";
          if (error) {
            errCode = error.killed
              ? "TIMEOUT"
              : normalizeProviderFailure({ exitCode, stderr: cleanStderr, error });
          }

          if (typeof child.pid === "number") {
            localShellActivePids.delete(child.pid);
          }

          resolve({
            exit: exitCode,
            stdout: cleanStdout,
            stderr: cleanStderr,
            filesOut: [],
            metrics: {
              wallMs,
              cpuMs: wallMs,
              memPeakMB: 0
            },
            sandboxRef: "local-process",
            errCode,
            taskKey: req.taskKey,
            raw: error
              ? { error: error.message, code: error.code, killed: error.killed, ctx }
              : { success: true, ctx }
          });
        }
      );

      let seq = 0;
      if (options?.onChunk) {
        child.stdout?.on("data", (data) =>
          options.onChunk?.({ kind: "stdout", chunk: data.toString(), seq: seq++ })
        );
        child.stderr?.on("data", (data) =>
          options.onChunk?.({ kind: "stderr", chunk: data.toString(), seq: seq++ })
        );
      }

      if (typeof child.pid === "number") {
        localShellActivePids.add(child.pid);
      }
    });
  }

  async health(): Promise<{ ok: boolean; provider: string }> {
    return { ok: true, provider: this.provider };
  }
}
