import type { Decision } from "./decide.step";
import { getConfig } from "../../config";
import { assertBuildOutput } from "../../contracts/oc/build.schema";
import type { SBXRes, SBXReq } from "../../contracts/index";
import { buildTaskKey } from "../task-key";
import { resolveRunInSBXPort } from "../../sbx/factory";
import type { RunInSBXPort, SBXMode } from "../../sbx/port";
import { getPool } from "../../db/pool";
import { findArtifactByUri } from "../../db/artifactRepo";
import { resolveSbxTemplateSelection, type ResolvedSbxTemplate } from "../../sbx/template-resolver";

export type ExecutionResult = SBXRes;
type ResolvePort = (modeOverride?: SBXMode) => RunInSBXPort;
type ResolveTemplate = (runId: string, fallbackEnvRef: string) => Promise<ResolvedSbxTemplate>;

export class ExecuteStepImpl {
  constructor(
    private readonly resolvePort: ResolvePort = resolveRunInSBXPort,
    private readonly resolveTemplate: ResolveTemplate = (runId, fallbackEnvRef) =>
      resolveSbxTemplateSelection(getPool(), runId, fallbackEnvRef)
  ) {}

  private resolveCommand(decision: Decision): string {
    if (!decision || !decision.structured) {
      throw new Error("Missing structured output in Decision; rejecting unsafe execution.");
    }
    assertBuildOutput(decision.structured);
    const command = decision.structured.test_command;
    if (!command) {
      throw new Error("Missing test_command in Decision; rejecting unsafe execution.");
    }
    if (command === "FAIL_ME" || command === "INFRA_FAIL" || command === "FLAKY_INFRA_FAIL") {
      return command;
    }
    return command;
  }

  private async buildRequest(
    command: string,
    ctx: { intentId: string; runId: string },
    cfg: ReturnType<typeof getConfig>,
    stepId: string,
    template: ResolvedSbxTemplate
  ): Promise<SBXReq> {
    const normalizedReq = {
      cmd: command,
      templateKey: template.templateKey,
      templateRef: template.source === "hot" ? template.templateId : template.envRef
    };
    return {
      envRef: template.source === "hot" ? "local-node-24" : template.envRef,
      templateId: template.source === "hot" ? template.templateId : undefined,
      templateKey: template.templateKey,
      depsHash: template.depsHash,
      cmd: command,
      filesIn: [],
      env: {},
      timeoutMs: cfg.sbxDefaultTimeoutMs,
      limits: { cpu: 1, memMB: 512 },
      net: cfg.sbxDefaultNet,
      taskKey: buildTaskKey({
        intentId: ctx.intentId,
        runId: ctx.runId,
        stepId: stepId,
        normalizedReq
      })
    };
  }

  async buildTasks(
    decision: Decision,
    ctx: { intentId: string; runId: string }
  ): Promise<SBXReq[]> {
    const cfg = getConfig();
    const command = this.resolveCommand(decision);
    assertBuildOutput(decision.structured);
    const tests = decision.structured.tests;
    const template = await this.resolveTemplate(ctx.runId, "local-node-24");

    if (!tests || tests.length === 0) {
      return [await this.buildRequest(command, ctx, cfg, "ExecuteST", template)];
    }

    return Promise.all(
      tests.map(async (test) => {
        const taskKey = buildTaskKey({
          intentId: ctx.intentId,
          runId: ctx.runId,
          stepId: "ExecuteST",
          normalizedReq: {
            cmd: command,
            test,
            templateKey: template.templateKey,
            templateRef: template.source === "hot" ? template.templateId : template.envRef
          }
        });
        const baseReq = await this.buildRequest(command, ctx, cfg, "ExecuteST", template);
        return {
          ...baseReq,
          cmd: `${command} ${test}`,
          taskKey
        };
      })
    );
  }

  async executeTask(
    req: SBXReq,
    ctx: { runId: string },
    options?: {
      onChunk?: (chunk: { kind: "stdout" | "stderr"; chunk: string; seq: number }) => void;
    }
  ): Promise<{ result: SBXRes; provider: string }> {
    const cfg = getConfig();

    if (cfg.chaosSleepExecuteMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, cfg.chaosSleepExecuteMs));
    }

    const port = this.resolvePort(cfg.sbxMode);
    const result = await port.run(
      req,
      { runId: ctx.runId, stepId: "ExecuteST" },
      {
        ...options,
        resolveArtifact: async (uri) => {
          const artifact = await findArtifactByUri(getPool(), uri);
          if (!artifact) throw new Error(`Artifact not found: ${uri}`);
          return {
            inline: artifact.inline,
            sha256: artifact.sha256
          };
        }
      }
    );
    return { result, provider: port.provider };
  }

  async execute(
    decision: Decision,
    ctx: { intentId: string; runId: string }
  ): Promise<{ result: SBXRes; request: SBXReq; provider: string }> {
    const cfg = getConfig();

    if (cfg.chaosSleepExecuteMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, cfg.chaosSleepExecuteMs));
    }
    const command = this.resolveCommand(decision);
    const template = await this.resolveTemplate(ctx.runId, "local-node-24");
    const sbxReq = await this.buildRequest(command, ctx, cfg, "ExecuteST", template);
    const port = this.resolvePort(cfg.sbxMode);
    const result = await port.run(
      sbxReq,
      { runId: ctx.runId, stepId: "ExecuteST" },
      {
        resolveArtifact: async (uri) => {
          const artifact = await findArtifactByUri(getPool(), uri);
          if (!artifact) throw new Error(`Artifact not found: ${uri}`);
          return {
            inline: artifact.inline,
            sha256: artifact.sha256
          };
        }
      }
    );

    return { result, request: sbxReq, provider: port.provider };
  }
}
