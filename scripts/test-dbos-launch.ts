import { DBOS } from "@dbos-inc/dbos-sdk";
import { IntentWorkflow } from "../src/workflow/dbos/intentWorkflow";

async function main() {
  await DBOS.launch();
  console.log("DBOS launched!");
  try {
    await DBOS.startWorkflow(IntentWorkflow.run, {
      workflowID: "test-wf-id-" + Date.now(),
      queueName: "intentQ"
    })("dummy-intent-id");
    console.log("Started workflow with intentQ!");
  } catch (err) {
    console.error("Failed to start workflow:", err);
  }
  await DBOS.shutdown();
}

main().catch(console.error);
