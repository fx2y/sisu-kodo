import type { RunStatus } from "../run-view.schema";
import type { RunHeaderStatus } from "./run-header.schema";

export const STATUS_MAP: Record<RunStatus, RunHeaderStatus> = {
  queued: "ENQUEUED",
  running: "PENDING",
  waiting_input: "WAITING_INPUT",
  succeeded: "SUCCESS",
  failed: "ERROR",
  canceled: "CANCELLED",
  retries_exceeded: "ERROR",
  repairing: "PENDING"
};

export function mapRunStatus(status: RunStatus): RunHeaderStatus {
  return STATUS_MAP[status] ?? "ERROR";
}

export const TERMINAL_STATUSES: Set<RunHeaderStatus> = new Set(["SUCCESS", "ERROR", "CANCELLED"]);
