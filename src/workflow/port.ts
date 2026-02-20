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

export type WorkflowOpsStatus =
  | "PENDING"
  | "SUCCESS"
  | "ERROR"
  | "MAX_RECOVERY_ATTEMPTS_EXCEEDED"
  | "CANCELLED"
  | "ENQUEUED";

export type WorkflowOpsStepStatus = "PENDING" | "SUCCESS" | "ERROR";

export type WorkflowOpsListQuery = {
  status?: WorkflowOpsStatus;
  name?: string;
  limit?: number;
};

export type WorkflowOpsSummary = {
  workflowID: string;
  status: WorkflowOpsStatus;
  workflowName: string;
  workflowClassName: string;
  queueName?: string;
  applicationVersion?: string;
  createdAt: number;
  updatedAt?: number;
};

export type WorkflowOpsStep = {
  stepId: string;
  functionId: number;
  status: WorkflowOpsStepStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
};

export type WorkflowForkRequest = {
  stepN: number;
  appVersion?: string;
};

export type WorkflowForkResult = {
  workflowID: string;
};

export interface WorkflowService {
  startIntentRun(workflowId: string, options?: WorkflowOptions): Promise<void>;
  startRepairRun(runId: string): Promise<void>;
  sendEvent(workflowId: string, event: unknown): Promise<void>;
  startCrashDemo(workflowId: string): Promise<void>;
  marks(workflowId: string): Promise<Record<string, number>>;
  resumeIncomplete(): Promise<void>;
  getWorkflowStatus(workflowId: string): Promise<string | undefined>;
  listWorkflowSteps(workflowId: string): Promise<WorkflowOpsStep[]>;
  waitUntilComplete(workflowId: string, timeoutMs?: number): Promise<void>;
  // Cycle 5 Ops Surface
  cancelWorkflow(workflowId: string): Promise<void>;
  resumeWorkflow(workflowId: string): Promise<void>;
  forkWorkflow(workflowId: string, request: WorkflowForkRequest): Promise<WorkflowForkResult>;
  listWorkflows(query: WorkflowOpsListQuery): Promise<WorkflowOpsSummary[]>;
  getWorkflow(workflowId: string): Promise<WorkflowOpsSummary | undefined>;
  // Cycle C3: fixture access for semantics tests
  startSlowStep(workflowId: string, step1SleepMs: number): Promise<void>;
  getSlowMarks(workflowId: string): Promise<Record<string, number>>;

  // Cycle C5: Time Primitives
  startSleepWorkflow(workflowId: string, sleepMs: number): Promise<void>;

  destroy(): Promise<void>;
}
