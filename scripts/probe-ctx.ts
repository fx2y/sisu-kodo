import { DBOS } from "@dbos-inc/dbos-sdk";

export class ProbeWorkflow {
  @DBOS.workflow()
  static async run() {
    const workflowContext = (DBOS as unknown as { workflowContext?: () => Record<string, unknown> })
      .workflowContext;
    const ctx = typeof workflowContext === "function" ? workflowContext() : {};
    console.log("Context keys:", Object.keys(ctx));
    console.log("recoveryAttempts:", ctx["recoveryAttempts"]);
    console.log("authenticatedUser:", ctx["authenticatedUser"]);
  }
}

async function main() {
  await DBOS.launch();
  await DBOS.startWorkflow(ProbeWorkflow.run)();
  await DBOS.shutdown();
}

main().catch(console.error);
