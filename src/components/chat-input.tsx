"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@src/components/ui/button";
import { Textarea } from "@src/components/ui/textarea";
import { startRun, RunClientError } from "@src/lib/run-client";
import { AlertCircle, Loader2, Play, RefreshCw, Settings2, ShieldAlert } from "lucide-react";
import { buildChatRunStartRequest } from "./chat-input.request";
import { BudgetEditor } from "./budget-editor";
import type { RunBudget } from "@src/contracts/run-request.schema";

const DEFAULT_BUDGET: RunBudget = {
  maxFanout: 50,
  maxSBXMinutes: 10,
  maxArtifactsMB: 100,
  maxRetriesPerStep: 3,
  maxWallClockMS: 600000 // 10m
};

export function ChatInput({ initialWid: _initialWid }: { initialWid?: string }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [budget, setBudget] = useState<RunBudget>(DEFAULT_BUDGET);
  const [conflict, setConflict] = useState<{ message: string; drift: ConflictDrift[] } | null>(
    null
  );
  const [isReplay, setIsReplay] = useState(false);
  const router = useRouter();

  const handleRun = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setConflict(null);
    setIsReplay(false);
    try {
      const request = buildChatRunStartRequest(input);
      if (showBudget) {
        if (!request.opts) request.opts = {};
        request.opts.budget = budget;
      }
      const res = await startRun(request);
      if (res.isReplay) {
        setIsReplay(true);
        setTimeout(() => setIsReplay(false), 5000);
      }
      router.push(`/?wid=${res.workflowID}`);
      setInput("");
    } catch (error) {
      if (error instanceof RunClientError && error.status === 409) {
        setConflict({ message: error.message, drift: readConflictDrift(error.details) });
      }
      console.error("Run error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative space-y-4">
      <div className="relative">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your goal..."
          className="min-h-[100px] pr-20 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleRun();
            }
          }}
        />
        <div className="absolute right-2 bottom-2 flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowBudget(!showBudget)}
            className={`h-8 w-8 p-0 ${showBudget ? "bg-accent text-accent-foreground" : ""}`}
            title="Budget Editor"
          >
            <ShieldAlert className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={loading || !input.trim()}
            className="gap-2 h-8"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            Run
          </Button>
        </div>
      </div>

      {showBudget && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Settings2 className="h-3 w-3" />
              Runtime Budget (Strict)
            </h4>
            <Badge variant="outline" className="text-[9px] h-4">
              Merged Effective
            </Badge>
          </div>
          <BudgetEditor budget={budget} onChange={setBudget} />
        </div>
      )}

      {isReplay && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-3 py-1 text-[10px] font-bold text-white shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            IDEMPOTENT REPLAY
          </div>
        </div>
      )}

      {conflict && (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <h3 className="text-sm font-semibold text-destructive">Identity Conflict (409)</h3>
              <p className="text-xs text-muted-foreground">{conflict.message}</p>

              {conflict.drift && conflict.drift.length > 0 && (
                <div className="rounded border bg-background/50 overflow-hidden">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-muted text-muted-foreground font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-2 py-1">Field</th>
                        <th className="px-2 py-1">Existing</th>
                        <th className="px-2 py-1">Incoming</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {conflict.drift.map((d) => (
                        <tr key={d.field}>
                          <td className="px-2 py-1 font-mono">{d.field}</td>
                          <td
                            className="px-2 py-1 font-mono text-destructive truncate max-w-[100px]"
                            title={String(d.existing)}
                          >
                            {String(d.existing)}
                          </td>
                          <td
                            className="px-2 py-1 font-mono text-green-600 truncate max-w-[100px]"
                            title={String(d.incoming)}
                          >
                            {String(d.incoming)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => setConflict(null)}
                >
                  Dismiss
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => setConflict(null)}
                >
                  Change Goal
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
