import { WorkflowQueue } from "@dbos-inc/dbos-sdk";

// Queue classes are declared once at module load and shared across worker/app runtimes.
new WorkflowQueue("compileQ", { concurrency: 10, priorityEnabled: true });
new WorkflowQueue("sandboxQ", { concurrency: 20, priorityEnabled: true });
new WorkflowQueue("controlQ", { concurrency: 5, priorityEnabled: true });
new WorkflowQueue("intentQ", { concurrency: 10 });
