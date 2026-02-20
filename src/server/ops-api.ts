import type { WorkflowService } from "../workflow/port";

/**
 * Cycle 5 Ops API surface.
 * These are thin wrappers around WorkflowService to maintain
 * separation between route handlers and engine implementations.
 */

export async function listWorkflows(service: WorkflowService, query: unknown) {
  return service.listWorkflows(query);
}

export async function getWorkflow(service: WorkflowService, workflowId: string) {
  return service.getWorkflow(workflowId);
}

export async function getWorkflowSteps(service: WorkflowService, workflowId: string) {
  return service.listWorkflowSteps(workflowId);
}

export async function cancelWorkflow(service: WorkflowService, workflowId: string) {
  return service.cancelWorkflow(workflowId);
}

export async function resumeWorkflow(service: WorkflowService, workflowId: string) {
  return service.resumeWorkflow(workflowId);
}

export async function forkWorkflow(
  service: WorkflowService,
  workflowId: string,
  fromStep?: string
) {
  return service.forkWorkflow(workflowId, fromStep);
}
