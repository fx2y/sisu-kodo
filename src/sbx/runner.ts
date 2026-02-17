import { exec } from "node:child_process";

export type SBXMode = "mock" | "live";

export type SandboxJob = {
  mode?: SBXMode;
  command?: string;
};

export type SandboxResult = {
  exitCode: number;
  stdout: string;
  files: Record<string, string>;
};

function stableFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

function runLive(command: string): Promise<SandboxResult> {
  return new Promise((resolve) => {
    exec(command, (error, stdout) => {
      let exitCode = 0;
      if (error) {
        exitCode = typeof error.code === "number" ? error.code : 1;
      }
      resolve({
        exitCode,
        stdout: stdout.replace(/\r\n/g, "\n"),
        files: stableFiles({ "artifact-index.json": JSON.stringify({ command }) })
      });
    });
  });
}

export async function runSandboxJob(job: SandboxJob): Promise<SandboxResult> {
  const mode = job.mode ?? "mock";
  if (mode === "mock") {
    return {
      exitCode: 0,
      stdout: "OK\n",
      files: stableFiles({ "out.json": "{}" })
    };
  }

  return runLive(job.command ?? "echo sbx-live");
}
