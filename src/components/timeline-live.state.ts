import type { RunHeader } from "@src/contracts/ui/run-header.schema";
import type { StepRow } from "@src/contracts/ui/step-row.schema";
import type { GateView } from "@src/contracts/ui/gate-view.schema";
import { TERMINAL_STATUSES } from "@src/contracts/ui/status-map";

export type TimelineState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "running"; header: RunHeader; steps: StepRow[]; gates: GateView[] }
  | { kind: "waiting_input"; header: RunHeader; steps: StepRow[]; gates: GateView[] }
  | { kind: "terminal"; header: RunHeader; steps: StepRow[]; gates: GateView[] };

export function selectTimelineState(
  header: RunHeader | null,
  steps: StepRow[],
  gates: GateView[]
): TimelineState {
  if (!header) return { kind: "empty" };

  if (TERMINAL_STATUSES.has(header.status)) {
    return { kind: "terminal", header, steps, gates };
  }

  if (header.status === "WAITING_INPUT") {
    return { kind: "waiting_input", header, steps, gates };
  }

  return { kind: "running", header, steps, gates };
}
