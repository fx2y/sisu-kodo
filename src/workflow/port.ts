export interface WorkflowService {
  startIntentRun(workflowId: string): Promise<void>;
  startCrashDemo(workflowId: string): Promise<void>;
  marks(workflowId: string): Promise<Record<string, number>>;
  resumeIncomplete(): Promise<void>;
  waitUntilComplete(workflowId: string, timeoutMs?: number): Promise<void>;
}
