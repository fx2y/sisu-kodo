export interface WorkflowOptions {
  queueName?: string;
  priority?: number; // Not natively in DBOS 1.x but we should expose for contract
  deduplicationID?: string;
  timeoutMS?: number;
}

export interface WorkflowService {
  startIntentRun(workflowId: string, options?: WorkflowOptions): Promise<void>;
  startRepairRun(runId: string): Promise<void>;
  sendEvent(workflowId: string, event: unknown): Promise<void>;
  startCrashDemo(workflowId: string): Promise<void>;
  marks(workflowId: string): Promise<Record<string, number>>;
  resumeIncomplete(): Promise<void>;
  waitUntilComplete(workflowId: string, timeoutMs?: number): Promise<void>;
}
