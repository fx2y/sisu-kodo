export interface WorkflowService {
  trigger(workflowId: string): Promise<void>;
  marks(workflowId: string): Promise<Record<string, number>>;
  resumeIncomplete(): Promise<void>;
  waitUntilComplete(workflowId: string, timeoutMs?: number): Promise<void>;
}
