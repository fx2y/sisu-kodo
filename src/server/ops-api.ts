import type {
  WorkflowForkRequest,
  WorkflowOpsListQuery,
  WorkflowOpsStatus,
  WorkflowService
} from "../workflow/port";

export type OpsActionAck = {
  accepted: true;
  workflowID: string;
};

export type OpsForkAck = {
  accepted: true;
  workflowID: string;
  forkedWorkflowID: string;
};

const cancellableStatuses = new Set<WorkflowOpsStatus>(["PENDING", "ENQUEUED"]);
const resumableStatuses = new Set<WorkflowOpsStatus>(["CANCELLED", "ENQUEUED"]);

export class OpsNotFoundError extends Error {
  constructor(workflowID: string) {
    super(`workflow not found: ${workflowID}`);
    this.name = "OpsNotFoundError";
  }
}

export class OpsConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpsConflictError";
  }
}

function isForkStepConflict(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "DBOSInvalidStepIDError") {
    return true;
  }
  return error.message.toLowerCase().includes("step");
}

async function getWorkflowOrThrow(service: WorkflowService, workflowID: string) {
  const workflow = await service.getWorkflow(workflowID);
  if (!workflow) {
    throw new OpsNotFoundError(workflowID);
  }
  return workflow;
}

export async function listWorkflows(service: WorkflowService, query: WorkflowOpsListQuery) {
  return service.listWorkflows(query);
}

export async function getWorkflow(service: WorkflowService, workflowId: string) {
  return getWorkflowOrThrow(service, workflowId);
}

export async function getWorkflowSteps(service: WorkflowService, workflowId: string) {
  await getWorkflowOrThrow(service, workflowId);
  return service.listWorkflowSteps(workflowId);
}

export async function cancelWorkflow(
  service: WorkflowService,
  workflowId: string
): Promise<OpsActionAck> {
  const workflow = await getWorkflowOrThrow(service, workflowId);
  if (!cancellableStatuses.has(workflow.status)) {
    throw new OpsConflictError(`cannot cancel workflow in status ${workflow.status}`);
  }
  await service.cancelWorkflow(workflowId);
  return { accepted: true, workflowID: workflowId };
}

export async function resumeWorkflow(
  service: WorkflowService,
  workflowId: string
): Promise<OpsActionAck> {
  const workflow = await getWorkflowOrThrow(service, workflowId);
  if (!resumableStatuses.has(workflow.status)) {
    throw new OpsConflictError(`cannot resume workflow in status ${workflow.status}`);
  }
  await service.resumeWorkflow(workflowId);
  return { accepted: true, workflowID: workflowId };
}

export async function forkWorkflow(
  service: WorkflowService,
  workflowId: string,
  request: WorkflowForkRequest
): Promise<OpsForkAck> {
  await getWorkflowOrThrow(service, workflowId);
  try {
    const forked = await service.forkWorkflow(workflowId, request);
    return {
      accepted: true,
      workflowID: workflowId,
      forkedWorkflowID: forked.workflowID
    };
  } catch (error) {
    if (isForkStepConflict(error)) {
      throw new OpsConflictError(
        error instanceof Error ? error.message : "fork conflict: invalid step"
      );
    }
    throw error;
  }
}
