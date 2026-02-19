export interface WorkflowOptions {
  queueName?: string;
  priority?: number;
  deduplicationID?: string;
  timeoutMS?: number;
  queuePartitionKey?: string;
}

export interface TaskHandle<T> {
  getResult(): Promise<T>;
  workflowID: string;
}

export interface WorkflowService {
  startIntentRun(workflowId: string, options?: WorkflowOptions): Promise<void>;
  startRepairRun(runId: string): Promise<void>;
  sendEvent(workflowId: string, event: unknown): Promise<void>;
  startCrashDemo(workflowId: string): Promise<void>;
  marks(workflowId: string): Promise<Record<string, number>>;
  resumeIncomplete(): Promise<void>;
  getWorkflowStatus(workflowId: string): Promise<string | undefined>;
  waitUntilComplete(workflowId: string, timeoutMs?: number): Promise<void>;
  destroy(): Promise<void>;
}
