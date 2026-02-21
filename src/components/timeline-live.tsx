"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Package,
  ShieldCheck
} from "lucide-react";
import { assertRunHeader, type RunHeader } from "@src/contracts/ui/run-header.schema";
import { assertStepRow, type StepRow } from "@src/contracts/ui/step-row.schema";
import { assertGateView, type GateView } from "@src/contracts/ui/gate-view.schema";
import { formatTime, nowMs, toIso } from "@src/lib/time";
import { buildTraceUrl } from "@src/lib/trace-link";
import { cn } from "@src/lib/utils";
import { Badge } from "@src/components/ui/badge";
import { Button } from "@src/components/ui/button";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Skeleton } from "@src/components/ui/skeleton";

const TERMINAL_STATUSES = new Set(["SUCCESS", "ERROR", "CANCELLED"]);

const STABLE_STEP_NUMBERS: Record<string, number> = {
  CompileST: 1,
  ApplyPatchST: 2,
  DecideST: 3,
  ExecuteST: 4
};

type OpsAction = "cancel" | "resume" | "fork";

type TimelineState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "running"; header: RunHeader; steps: StepRow[]; gates: GateView[] }
  | { kind: "terminal"; header: RunHeader; steps: StepRow[]; gates: GateView[] };

function sortStepRows(steps: StepRow[]): StepRow[] {
  return [...steps].sort((a, b) => a.startedAt - b.startedAt || a.stepID.localeCompare(b.stepID));
}

function copyIfPresent(value: string | null | undefined): void {
  if (!value) return;
  void navigator.clipboard.writeText(value);
}

function defaultForkStepN(steps: StepRow[]): number {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].error) {
      return STABLE_STEP_NUMBERS[steps[i].stepID] ?? 1;
    }
  }
  const last = steps[steps.length - 1];
  if (!last) return 1;
  return STABLE_STEP_NUMBERS[last.stepID] ?? 1;
}

function HitlGateCard({
  wid,
  gate,
  onResolved
}: {
  wid: string;
  gate: GateView;
  onResolved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [replyPayload, setReplyPayload] = useState<Record<string, unknown>>({});

  const handleReply = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${wid}/gates/${gate.gateKey}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: replyPayload,
          dedupeKey: `ui-${wid}-${gate.gateKey}-${nowMs()}`
        })
      });
      if (res.ok) {
        onResolved();
      } else {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        window.alert(`Reply failed: ${err.error}`);
      }
    } catch (err) {
      console.error("Reply error:", err);
    } finally {
      setLoading(false);
    }
  };

  const isPending = gate.state === "PENDING";
  const isResolved = gate.state === "RECEIVED";
  const isTimedOut = gate.state === "TIMED_OUT";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border p-4 animate-in fade-in zoom-in duration-300",
        isPending ? "border-yellow-500/20 bg-yellow-500/5" : "border-muted bg-muted/10 opacity-80"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              isPending ? "bg-yellow-500/10 text-yellow-600" : "bg-muted text-muted-foreground"
            )}
          >
            {isResolved ? (
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            ) : isTimedOut ? (
              <Clock className="h-6 w-6 text-destructive" />
            ) : (
              <ShieldCheck className="h-6 w-6" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">
              {String(
                (gate.prompt.formSchema as Record<string, unknown>).title || `Gate: ${gate.gateKey}`
              )}
            </span>
            <span className="text-xs opacity-70">
              {isPending
                ? `Expires at ${formatTime(gate.deadlineAt)}`
                : isResolved
                  ? `Resolved at ${formatTime(gate.result?.at || 0)}`
                  : `Timed out at ${formatTime(gate.deadlineAt)}`}
            </span>
          </div>
        </div>
        <Badge variant={isPending ? "outline" : "secondary"}>{gate.state}</Badge>
      </div>

      {isPending && (
        <div className="space-y-4">
          <div className="grid gap-3">
            {(gate.prompt.formSchema.fields as Record<string, unknown>[])?.map((f) => (
              <div key={String(f.k)} className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">
                  {String(f.k)} {f.opt ? "(optional)" : ""}
                </label>
                {f.t === "enum" ? (
                  <div className="flex flex-wrap gap-2">
                    {(f.vs as string[])?.map((v: string) => (
                      <Button
                        key={v}
                        variant={replyPayload[String(f.k)] === v ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setReplyPayload((p) => ({ ...p, [String(f.k)]: v }))}
                      >
                        {v}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="w-full rounded border bg-background px-2 py-1 text-xs"
                    placeholder={`Enter ${String(f.k)}...`}
                    value={(replyPayload[String(f.k)] as string) || ""}
                    onChange={(e) =>
                      setReplyPayload((p) => ({ ...p, [String(f.k)]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <Button
            onClick={handleReply}
            disabled={loading}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white shadow-sm h-9"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Submit Response
          </Button>
        </div>
      )}

      {isResolved && gate.result?.payload && (
        <pre className="rounded bg-black/5 p-2 text-[10px] dark:bg-white/5">
          {JSON.stringify(gate.result.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    PENDING: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    ENQUEUED: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    SUCCESS: "bg-green-500/10 text-green-600 border-green-500/20",
    ERROR: "bg-destructive/10 text-destructive border-destructive/20",
    CANCELLED: "bg-muted text-muted-foreground border-border"
  };

  return (
    <Badge variant="outline" className={cn("font-mono font-bold tracking-tight", variants[status])}>
      {status}
    </Badge>
  );
}

function OpsControlBar({
  status,
  busyAction,
  forkStepN,
  onAction
}: {
  status: string;
  busyAction: OpsAction | null;
  forkStepN: number;
  onAction: (op: OpsAction, forkDefaultStepN?: number) => Promise<void>;
}) {
  const canCancel = ["PENDING", "ENQUEUED"].includes(status);
  const canResume = ["CANCELLED", "ENQUEUED"].includes(status);
  const canFork = status === "SUCCESS" || status === "ERROR";

  if (!canCancel && !canResume && !canFork) return null;

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
      id="ops-control-bar"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
        Ops
      </span>
      {canCancel && (
        <Button
          id="ops-cancel-btn"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={busyAction !== null}
          onClick={() => void onAction("cancel")}
        >
          {busyAction === "cancel" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Cancel
        </Button>
      )}
      {canResume && (
        <Button
          id="ops-resume-btn"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
          disabled={busyAction !== null}
          onClick={() => void onAction("resume")}
        >
          {busyAction === "resume" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Resume
        </Button>
      )}
      {canFork && (
        <Button
          id="ops-fork-btn"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs border-purple-500/40 text-purple-600 hover:bg-purple-500/10"
          disabled={busyAction !== null}
          onClick={() => void onAction("fork", forkStepN)}
        >
          {busyAction === "fork" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Fork
        </Button>
      )}
    </div>
  );
}

function StepItem({
  step,
  wid,
  traceBaseUrl,
  onSelectArtifact
}: {
  step: StepRow;
  wid: string;
  traceBaseUrl?: string;
  onSelectArtifact: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const duration = step.endedAt ? step.endedAt - step.startedAt : null;
  const traceUrl = buildTraceUrl(traceBaseUrl, step.traceId, step.spanId);

  return (
    <div className="relative flex gap-4">
      <div
        className={cn(
          "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background transition-colors",
          step.endedAt
            ? step.error
              ? "border-destructive text-destructive"
              : "border-green-500 text-green-500"
            : "border-primary text-primary animate-pulse"
        )}
      >
        {step.endedAt ? (
          step.error ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )
        ) : (
          <div className="h-2 w-2 rounded-full bg-current" />
        )}
      </div>

      <div className="flex-1 pb-4">
        <div className="flex flex-col gap-1">
          <div className="group flex items-center justify-between">
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-2 text-left text-sm font-semibold hover:underline"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {step.name}
              {step.attempt > 1 && (
                <Badge variant="secondary" className="h-4 text-[8px]">
                  attempt {step.attempt}
                </Badge>
              )}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {traceUrl && (
                <a
                  href={traceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 transition-colors hover:text-primary"
                  title="View trace"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {duration !== null && (
                <span className="font-mono">{(duration / 1000).toFixed(1)}s</span>
              )}
            </div>
          </div>

          {expanded && (
            <div className="mb-1 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground">WID: {wid}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-3 w-3"
                  onClick={() => copyIfPresent(wid)}
                >
                  <Copy className="h-2 w-2" />
                </Button>
              </div>
              {step.traceId && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    TRACE: {step.traceId}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-3 w-3"
                    onClick={() => copyIfPresent(step.traceId)}
                  >
                    <Copy className="h-2 w-2" />
                  </Button>
                </div>
              )}
              {step.spanId && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    SPAN: {step.spanId}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-3 w-3"
                    onClick={() => copyIfPresent(step.spanId)}
                  >
                    <Copy className="h-2 w-2" />
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="mt-1 flex flex-wrap gap-2">
            {step.artifactRefs.map((ref) => (
              <button
                key={ref.id}
                onClick={() => onSelectArtifact(ref.id)}
                className="flex items-center gap-1 rounded border bg-muted/50 px-2 py-0.5 text-[10px] font-medium transition-colors hover:bg-accent"
              >
                <Package className="h-3 w-3" />
                {ref.kind}
              </button>
            ))}
            {step.artifactRefs.length === 0 && !step.endedAt && (
              <span className="text-[10px] italic text-muted-foreground">Executing...</span>
            )}
          </div>
        </div>

        {expanded && step.error && (
          <div className="mt-2 overflow-auto rounded border border-destructive/10 bg-destructive/5 p-2 font-mono text-xs text-destructive">
            {JSON.stringify(step.error, null, 2)}
          </div>
        )}
      </div>
    </div>
  );
}

export function TimelineLive({
  wid,
  onSelectArtifact
}: {
  wid: string;
  onSelectArtifact: (id: string) => void;
}) {
  const [state, setState] = useState<TimelineState>({ kind: "loading" });
  const [busyAction, setBusyAction] = useState<OpsAction | null>(null);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = async () => {
    try {
      const [headerRes, stepsRes, gatesRes] = await Promise.all([
        fetch(`/api/runs/${wid}`, { cache: "no-store" }),
        fetch(`/api/runs/${wid}/steps`, { cache: "no-store" }),
        fetch(`/api/runs/${wid}/gates`, { cache: "no-store" })
      ]);

      if (headerRes.status === 404) {
        setState({ kind: "empty" });
        return;
      }

      if (!headerRes.ok) throw new Error("Failed to fetch run header");
      if (!stepsRes.ok) throw new Error("Failed to fetch steps");
      if (!gatesRes.ok) throw new Error("Failed to fetch gates");

      const headerData = await headerRes.json();
      assertRunHeader(headerData);

      const stepData = await stepsRes.json();
      if (!Array.isArray(stepData)) throw new Error("Steps response must be an array");
      for (const step of stepData) {
        assertStepRow(step);
      }

      const gateData = await gatesRes.json();
      if (!Array.isArray(gateData)) throw new Error("Gates response must be an array");
      for (const gate of gateData) {
        assertGateView(gate);
      }

      const steps = sortStepRows(stepData);

      if (TERMINAL_STATUSES.has(headerData.status)) {
        setState({ kind: "terminal", header: headerData, steps, gates: gateData });
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
          pollInterval.current = null;
        }
      } else {
        setState({ kind: "running", header: headerData, steps, gates: gateData });
      }
    } catch (error: unknown) {
      console.error("Polling error:", error);
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  };

  const handleOpsAction = async (op: OpsAction, forkDefaultStepN?: number): Promise<void> => {
    const reason = window.prompt(`Reason for ${op}?`, "");
    if (reason === null) return;
    if (reason.trim().length === 0) {
      window.alert("operation rejected: reason is required");
      return;
    }

    setBusyAction(op);
    try {
      const body: Record<string, unknown> = { actor: "ui", reason };
      if (op === "fork") {
        const stepNRaw = window.prompt("Fork from step N?", String(forkDefaultStepN ?? 1));
        if (stepNRaw === null) return;
        const stepN = Number.parseInt(stepNRaw, 10);
        if (!Number.isInteger(stepN) || stepN < 1) {
          window.alert("fork rejected: stepN must be a positive integer");
          return;
        }
        body.stepN = stepN;
      }
      const res = await fetch(`/api/ops/wf/${wid}/${op}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        window.alert(`${op} failed: ${err.error ?? res.statusText}`);
        return;
      }
      await fetchState();
    } catch (error) {
      window.alert(`${op} error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    setState({ kind: "loading" });
    void fetchState();

    // Polling as a durable fallback
    pollInterval.current = setInterval(() => {
      void fetchState();
    }, 2000);

    // Stream for low-latency updates
    const controller = new AbortController();
    const startStream = async () => {
      try {
        const res = await fetch(`/api/runs/${wid}/stream/status`, {
          signal: controller.signal
        });
        if (!res.ok) return;

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line) as { status: string };
              if (chunk.status) {
                // Trigger immediate fetch to sync full state when status changes
                void fetchState();
              }
            } catch (_e) {
              // Ignore parse errors from partial lines
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        // On error, the polling fallback will keep things alive
      }
    };

    void startStream();

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
      pollInterval.current = null;
      controller.abort();
    };
  }, [wid]);

  if (state.kind === "loading") {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-4">
        <AlertCircle className="w-12 h-12 text-destructive opacity-50" />
        <div className="space-y-1">
          <h3 className="font-semibold text-destructive">Failed to load timeline</h3>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchState()}>
          Retry
        </Button>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-4 text-muted-foreground opacity-50">
        <Clock className="w-12 h-12" />
        <p className="text-sm italic">No execution found for this ID.</p>
      </div>
    );
  }

  const { header, steps, gates } = state;
  const lastStep = steps[steps.length - 1];
  const lastStepEnd = lastStep?.endedAt ? toIso(lastStep.endedAt) : "In progress...";
  const suggestedForkStepN = defaultForkStepN(steps);
  const showRepairForkHint = header.status === "ERROR" && header.nextAction === "REPAIR";

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        {header && (
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Durability Active
                </span>
                <span className="text-xs font-medium">
                  Safe to kill/restart. Resumes from last checkpoint.
                </span>
              </div>
            </div>
            <div className="text-right font-mono text-[10px] opacity-60">
              LAST_SYNC: {lastStepEnd}
            </div>
          </div>
        )}

        {gates.map((gate) => (
          <HitlGateCard key={gate.gateKey} wid={wid} gate={gate} onResolved={() => fetchState()} />
        ))}

        <OpsControlBar
          status={header?.status ?? ""}
          busyAction={busyAction}
          forkStepN={suggestedForkStepN}
          onAction={handleOpsAction}
        />

        {header && (
          <div className="flex items-center justify-between rounded-lg border bg-card p-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={header.status} />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{header.workflowName || "Workflow"}</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs text-muted-foreground">{wid}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4"
                    onClick={() => navigator.clipboard.writeText(wid)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
            {header.error && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                Error
              </Badge>
            )}
          </div>
        )}

        <div className="relative space-y-3">
          <div className="absolute bottom-2 left-[17px] top-2 w-px bg-border" />
          {steps.map((step) => (
            <StepItem
              key={step.stepID}
              step={step}
              wid={wid}
              traceBaseUrl={header?.traceBaseUrl}
              onSelectArtifact={onSelectArtifact}
            />
          ))}
          {steps.length === 0 && header?.status === "ENQUEUED" && (
            <div className="flex items-center gap-4 pl-1 opacity-50">
              <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background">
                <Clock className="h-4 w-4 animate-pulse" />
              </div>
              <div className="flex-1 py-2">
                <p className="text-sm font-medium italic">Waiting for steps to start...</p>
              </div>
            </div>
          )}
        </div>

        {header && TERMINAL_STATUSES.has(header.status) && (
          <div
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-4",
              header.status === "SUCCESS"
                ? "border-green-500/20 bg-green-500/5"
                : "border-destructive/20 bg-destructive/5"
            )}
          >
            <div className="flex items-center gap-2">
              {header.status === "SUCCESS" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              <h3 className="font-semibold">
                {header.status === "SUCCESS" ? "Execution Successful" : "Execution Failed"}
              </h3>
            </div>
            {header.error && (
              <pre className="max-h-40 overflow-auto rounded bg-black/5 p-2 text-xs dark:bg-white/5">
                {JSON.stringify(header.error, null, 2)}
              </pre>
            )}
            {showRepairForkHint && (
              <div className="mt-2 flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 p-3">
                <div className="text-xs">
                  <span className="font-semibold">Next action:</span> fix the root cause, then fork
                  from the failed step.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={busyAction !== null}
                  onClick={() => void handleOpsAction("fork", suggestedForkStepN)}
                >
                  {busyAction === "fork" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Fix & Fork
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
