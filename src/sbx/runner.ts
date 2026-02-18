import { exec } from "node:child_process";
import type { SBXReq, SBXRes } from "../contracts/index";
import { sha256 } from "../lib/hash";
import { nowMs } from "../lib/time";

export type SBXMode = "mock" | "live";

function stableFiles(files: SBXRes["filesOut"]): SBXRes["filesOut"] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

function runLive(req: SBXReq): Promise<SBXRes> {
  const start = nowMs();
  return new Promise((resolve) => {
    exec(req.cmd, (error, stdout, stderr) => {
      const wallMs = nowMs() - start;
      const cleanStdout = stdout.replace(/\r\n/g, "\n");
      const cleanStderr = stderr.replace(/\r\n/g, "\n");
      let exitCode = 0;
      let errCode: SBXRes["errCode"] = "NONE";
      if (error) {
        exitCode = typeof error.code === "number" ? error.code : 1;
        errCode = "CMD_NONZERO";
      }

      const indexContent = JSON.stringify({
        cmd: req.cmd,
        stdout: cleanStdout,
        stderr: cleanStderr
      });
      resolve({
        exit: exitCode,
        stdout: cleanStdout,
        stderr: cleanStderr,
        filesOut: stableFiles([
          {
            path: "artifact-index.json",
            sha256: sha256(indexContent),
            inline: indexContent
          }
        ]),
        metrics: {
          wallMs,
          cpuMs: wallMs,
          memPeakMB: 0
        },
        sandboxRef: "local-process",
        errCode,
        taskKey: req.taskKey
      });
    });
  });
}

export async function runSandboxJob(req: SBXReq, mode: SBXMode = "mock"): Promise<SBXRes> {
  if (mode === "mock") {
    const mockContent = "{}";
    return {
      exit: 0,
      stdout: "OK\n",
      stderr: "",
      filesOut: stableFiles([
        {
          path: "out.json",
          sha256: sha256(mockContent),
          inline: mockContent
        }
      ]),
      metrics: { wallMs: 1, cpuMs: 1, memPeakMB: 1 },
      sandboxRef: "mock-runner",
      errCode: "NONE",
      taskKey: req.taskKey
    };
  }

  return runLive(req);
}
