"use client";

import { useEffect, useState, useRef } from "react";
import type { RunHeader } from "@src/contracts/ui/run-header.schema";
import type { StepRow } from "@src/contracts/ui/step-row.schema";
import { Badge } from "@src/components/ui/badge";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Skeleton } from "@src/components/ui/skeleton";
import { cn } from "@src/lib/utils";
import { ChevronDown, ChevronRight, Clock, Package, AlertCircle, CheckCircle2, Copy, ShieldCheck } from "lucide-react";
import { Button } from "@src/components/ui/button";

const TERMINAL_STATUSES = new Set([
  "SUCCESS",
  "ERROR",
  "CANCELLED",
  "MAX_RECOVERY_ATTEMPTS_EXCEEDED",
]);

export function TimelineLive({ 
  wid, 
  onSelectArtifact 
}: { 
  wid: string; 
  onSelectArtifact: (id: string) => void;
}) {
  const [header, setHeader] = useState<RunHeader | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const fetchState = async () => {
    try {
      const [headerRes, stepsRes] = await Promise.all([
        fetch(`/api/runs/${wid}`, { cache: "no-store" }),
        fetch(`/api/runs/${wid}/steps`, { cache: "no-store" }),
      ]);

      if (!headerRes.ok) throw new Error("Failed to fetch run header");
      if (!stepsRes.ok) throw new Error("Failed to fetch steps");

      const headerData = await headerRes.json();
      const stepsData = await stepsRes.json();

      setHeader(headerData);
      setSteps(stepsData.sort((a: StepRow, b: StepRow) => a.startedAt - b.startedAt || a.stepID.localeCompare(b.stepID)));
      setLoading(false);

      if (TERMINAL_STATUSES.has(headerData.status)) {
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
          pollInterval.current = null;
        }
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchState();
    pollInterval.current = setInterval(fetchState, 1000);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [wid]);

  if (loading && !header) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const lastStep = steps[steps.length - 1];
  const lastStepEnd = lastStep?.endedAt ? new Date(lastStep.endedAt).toLocaleTimeString() : "In progress...";

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Durability Banner */}
        {header && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                 <span className="text-[10px] uppercase font-bold text-primary tracking-wider">Durability Active</span>
                 <span className="text-xs font-medium">Safe to kill/restart. Resumes from last checkpoint.</span>
              </div>
            </div>
            <div className="text-[10px] font-mono opacity-60 text-right">
              LAST_SYNC: {lastStepEnd}
            </div>
          </div>
        )}

        {/* Run Header Summary */}
        {header && (
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <StatusBadge status={header.status} />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{header.workflowName || "Workflow"}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground font-mono">{wid}</span>
                  <Button variant="ghost" size="icon" className="w-4 h-4 h-min" onClick={() => copyToClipboard(wid)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
            {header.error && (
               <Badge variant="destructive" className="gap-1">
                 <AlertCircle className="w-3 h-3" />
                 Error
               </Badge>
            )}
          </div>
        )}

        {/* Steps Timeline */}
        <div className="space-y-3 relative">
          <div className="absolute left-[17px] top-2 bottom-2 w-px bg-border" />
          {steps.map((step) => (
            <StepItem key={step.stepID} step={step} onSelectArtifact={onSelectArtifact} wid={wid} />
          ))}
          {(!steps.length && header?.status === "ENQUEUED") && (
             <div className="flex items-center gap-4 pl-1 opacity-50">
                <div className="w-8 h-8 rounded-full border bg-background flex items-center justify-center shrink-0 z-10">
                  <Clock className="w-4 h-4 animate-pulse" />
                </div>
                <div className="flex-1 py-2">
                  <p className="text-sm font-medium italic">Waiting for steps to start...</p>
                </div>
             </div>
          )}
        </div>


        {/* Terminal Result */}
        {header && TERMINAL_STATUSES.has(header.status) && (
          <div className={cn(
            "p-4 rounded-lg border flex flex-col gap-2",
            header.status === "SUCCESS" ? "bg-green-500/5 border-green-500/20" : "bg-destructive/5 border-destructive/20"
          )}>
            <div className="flex items-center gap-2">
              {header.status === "SUCCESS" ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive" />
              )}
              <h3 className="font-semibold">
                {header.status === "SUCCESS" ? "Execution Successful" : "Execution Failed"}
              </h3>
            </div>
            {header.error && (
              <pre className="text-xs p-2 bg-black/5 dark:bg-white/5 rounded overflow-auto max-h-40">
                {JSON.stringify(header.error, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    PENDING: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    ENQUEUED: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    SUCCESS: "bg-green-500/10 text-green-600 border-green-500/20",
    ERROR: "bg-destructive/10 text-destructive border-destructive/20",
    CANCELLED: "bg-muted text-muted-foreground border-border",
    MAX_RECOVERY_ATTEMPTS_EXCEEDED: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  };

  return (
    <Badge variant="outline" className={cn("font-mono font-bold tracking-tight", variants[status])}>
      {status}
    </Badge>
  );
}

function StepItem({ step, onSelectArtifact, wid }: { step: StepRow; onSelectArtifact: (id: string) => void; wid: string }) {
  const [expanded, setExpanded] = useState(false);
  const duration = step.endedAt ? step.endedAt - step.startedAt : null;

  return (
    <div className="flex gap-4 relative">
      <div className={cn(
        "w-8 h-8 rounded-full border bg-background flex items-center justify-center shrink-0 z-10 transition-colors",
        step.endedAt ? (step.error ? "border-destructive text-destructive" : "border-green-500 text-green-500") : "border-primary animate-pulse text-primary"
      )}>
        {step.endedAt ? (
           step.error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-current" />
        )}
      </div>
      
      <div className="flex-1 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between group">
            <button 
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 text-sm font-semibold hover:underline text-left"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {step.name}
              {step.attempt > 1 && (
                <Badge variant="secondary" className="text-[8px] h-4">attempt {step.attempt}</Badge>
              )}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
               {duration !== null && (
                 <span className="font-mono">{(duration / 1000).toFixed(1)}s</span>
               )}
            </div>
          </div>

          {expanded && (
            <div className="flex items-center gap-2 mb-1">
               <span className="text-[10px] font-mono text-muted-foreground">WID: {wid}</span>
               <Button variant="ghost" size="icon" className="w-3 h-3 h-min" onClick={() => navigator.clipboard.writeText(wid)}>
                  <Copy className="w-2 h-2" />
               </Button>
            </div>
          )}
          
          <div className="flex flex-wrap gap-2 mt-1">
            {step.artifactRefs.map((ref) => (
              <button
                key={ref.id}
                onClick={() => onSelectArtifact(ref.id)}
                className="flex items-center gap-1 px-2 py-0.5 rounded border bg-muted/50 text-[10px] font-medium hover:bg-accent transition-colors"
              >
                <Package className="w-3 h-3" />
                {ref.kind}
              </button>
            ))}
            {step.artifactRefs.length === 0 && !step.endedAt && (
               <span className="text-[10px] text-muted-foreground italic">Executing...</span>
            )}
          </div>
        </div>


        {expanded && step.error && (
          <div className="mt-2 p-2 rounded bg-destructive/5 border border-destructive/10 text-xs font-mono text-destructive overflow-auto">
            {JSON.stringify(step.error, null, 2)}
          </div>
        )}
      </div>
    </div>
  );
}
