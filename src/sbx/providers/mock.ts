import { exec } from "node:child_process";
import type { SBXReq, SBXRes } from "../../contracts";
import { sha256 } from "../../lib/hash";
import { nowMs } from "../../lib/time";
import { normalizeProviderFailure } from "../failure";
import type { RunInSBXContext, RunInSBXPort } from "../port";

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

  async run(req: SBXReq, ctx: RunInSBXContext): Promise<SBXRes> {
    if (req.cmd === "INFRA_FAIL") {
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

    if (req.cmd === "FAIL_ME") {
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

    if (req.cmd === "FLAKY_INFRA_FAIL" && mockInjectedFailCount < 2) {
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

    const mockContent = "{}";
    return {
      exit: 0,
      stdout: "OK\n",
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

  async run(req: SBXReq, ctx: RunInSBXContext): Promise<SBXRes> {
    const unsupportedUpload = req.filesIn.find((file) => file.inline === undefined);
    if (unsupportedUpload) {
      return {
        exit: 1,
        stdout: "",
        stderr: `filesIn entry requires inline payload: ${unsupportedUpload.path}`,
        filesOut: [],
        metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 0 },
        sandboxRef: "local-process",
        errCode: "UPLOAD_FAIL",
        taskKey: req.taskKey,
        raw: { ctx, provider: this.provider }
      };
    }

    const start = nowMs();
    return await new Promise<SBXRes>((resolve) => {
      const child = exec(
        req.cmd,
        { env: { ...process.env, ...req.env }, timeout: req.timeoutMs, cwd: req.workdir },
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

      if (typeof child.pid === "number") {
        localShellActivePids.add(child.pid);
      }
    });
  }

  async health(): Promise<{ ok: boolean; provider: string }> {
    return { ok: true, provider: this.provider };
  }
}
