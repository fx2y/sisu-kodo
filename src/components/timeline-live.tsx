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
import { toIso } from "@src/lib/time";
import { buildTraceUrl } from "@src/lib/trace-link";
import { cn } from "@src/lib/utils";
import { Badge } from "@src/components/ui/badge";
import { Button } from "@src/components/ui/button";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Skeleton } from "@src/components/ui/skeleton";

const TERMINAL_STATUSES = new Set([
  "SUCCESS",
  "ERROR",
  "CANCELLED",
  "MAX_RECOVERY_ATTEMPTS_EXCEEDED"
]);

type TimelineState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "running"; header: RunHeader; steps: StepRow[] }
  | { kind: "terminal"; header: RunHeader; steps: StepRow[] };

function sortStepRows(steps: StepRow[]): StepRow[] {
  return [...steps].sort((a, b) => a.startedAt - b.startedAt || a.stepID.localeCompare(b.stepID));
}

function copyIfPresent(value: string | null | undefined): void {
  if (!value) return;
  void navigator.clipboard.writeText(value);
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    PENDING: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    ENQUEUED: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    SUCCESS: "bg-green-500/10 text-green-600 border-green-500/20",
    ERROR: "bg-destructive/10 text-destructive border-destructive/20",
    CANCELLED: "bg-muted text-muted-foreground border-border",
    MAX_RECOVERY_ATTEMPTS_EXCEEDED: "bg-orange-500/10 text-orange-600 border-orange-500/20"
  };

  return (
    <Badge variant="outline" className={cn("font-mono font-bold tracking-tight", variants[status])}>
      {status}
    </Badge>
  );
}

function PlanApprovalBanner({ wid, onApproved }: { wid: string; onApproved: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${wid}/approve-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedBy: "user", notes: "Approved via UI" })
      });
      if (res.ok) {
        onApproved();
      }
    } catch (err) {
      console.error("Approval error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 animate-in fade-in zoom-in duration-300">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-600">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-yellow-700">Plan Approval Required</span>
          <span className="text-xs text-yellow-600/80">
            Review the plan above and approve to continue execution.
          </span>
        </div>
      </div>
      <Button
        onClick={handleApprove}
        disabled={loading}
        className="bg-yellow-600 hover:bg-yellow-700 text-white border-none shadow-sm h-9 px-4"
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="mr-2 h-4 w-4" />
        )}
        Approve Plan
      </Button>
    </div>
  );
}
function OpsControlBar({
  wid,
  status,
  onDone
}: {
  wid: string;
  status: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const canCancel = ["PENDING", "ENQUEUED"].includes(status);
  const canResume = ["CANCELLED", "ENQUEUED"].includes(status);
  const canFork =
    status === "SUCCESS" || status === "ERROR" || status === "MAX_RECOVERY_ATTEMPTS_EXCEEDED";

  async function callOp(op: "cancel" | "resume" | "fork") {
    const reason = window.prompt(`Reason for ${op}?`, "");
    if (reason === null) return;
    setBusy(op);
    try {
      const body: Record<string, unknown> = { actor: "ui", reason };
      if (op === "fork") {
        const stepNStr = window.prompt("Fork from step N?", "1");
        if (!stepNStr) {
          setBusy(null);
          return;
        }
        body.stepN = Number(stepNStr);
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
      } else {
        onDone();
      }
    } catch (e) {
      window.alert(`${op} error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

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
          disabled={busy !== null}
          onClick={() => void callOp("cancel")}
        >
          {busy === "cancel" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Cancel
        </Button>
      )}
      {canResume && (
        <Button
          id="ops-resume-btn"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
          disabled={busy !== null}
          onClick={() => void callOp("resume")}
        >
          {busy === "resume" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Resume
        </Button>
      )}
      {canFork && (
        <Button
          id="ops-fork-btn"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs border-purple-500/40 text-purple-600 hover:bg-purple-500/10"
          disabled={busy !== null}
          onClick={() => void callOp("fork")}
        >
          {busy === "fork" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
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
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = async () => {
    try {
      const [headerRes, stepsRes] = await Promise.all([
        fetch(`/api/runs/${wid}`, { cache: "no-store" }),
        fetch(`/api/runs/${wid}/steps`, { cache: "no-store" })
      ]);

      if (headerRes.status === 404) {
        setState({ kind: "empty" });
        return;
      }

      if (!headerRes.ok) throw new Error("Failed to fetch run header");
      if (!stepsRes.ok) throw new Error("Failed to fetch steps");

      const headerData = await headerRes.json();
      assertRunHeader(headerData);

      const stepData = await stepsRes.json();
      if (!Array.isArray(stepData)) throw new Error("Steps response must be an array");
      for (const step of stepData) {
        assertStepRow(step);
      }

      const steps = sortStepRows(stepData);

      if (TERMINAL_STATUSES.has(headerData.status)) {
        setState({ kind: "terminal", header: headerData, steps });
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
          pollInterval.current = null;
        }
      } else {
        setState({ kind: "running", header: headerData, steps });
      }
    } catch (error: unknown) {
      console.error("Polling error:", error);
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  };

  useEffect(() => {
    setState({ kind: "loading" });
    void fetchState();
    pollInterval.current = setInterval(() => {
      void fetchState();
    }, 1000);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
      pollInterval.current = null;
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

  const { header, steps } = state;
  const lastStep = steps[steps.length - 1];
  const lastStepEnd = lastStep?.endedAt ? toIso(lastStep.endedAt) : "In progress...";

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

        {header && header.nextAction === "APPROVE_PLAN" && (
          <PlanApprovalBanner wid={wid} onApproved={() => fetchState()} />
        )}

        <OpsControlBar wid={wid} status={header?.status ?? ""} onDone={() => void fetchState()} />

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
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
