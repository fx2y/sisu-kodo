"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { assertHitlInboxRow, type HitlInboxRow } from "@src/contracts/ui/hitl-inbox-row.schema";
import { formatRelative, formatTime, toIso } from "@src/lib/time";
import { Badge } from "@src/components/ui/badge";
import { Button } from "@src/components/ui/button";
import { ScrollArea } from "@src/components/ui/scroll-area";

function sortInbox(rows: HitlInboxRow[]): HitlInboxRow[] {
  return [...rows].sort((a, b) => {
    const aDeadline = a.deadline ?? Number.POSITIVE_INFINITY;
    const bDeadline = b.deadline ?? Number.POSITIVE_INFINITY;
    return (
      aDeadline - bDeadline || a.createdAt - b.createdAt || a.workflowID.localeCompare(b.workflowID)
    );
  });
}

export function HitlInboxBoard() {
  const [rows, setRows] = useState<HitlInboxRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchRows = async () => {
    try {
      setError(null);
      const res = await fetch("/api/hitl/inbox?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error(`inbox_fetch_failed:${res.status}`);
      const payload = await res.json();
      if (!Array.isArray(payload)) throw new Error("inbox_payload_invalid");
      const parsed: HitlInboxRow[] = [];
      for (const item of payload) {
        assertHitlInboxRow(item);
        parsed.push(item);
      }
      setRows(sortInbox(parsed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "inbox_fetch_failed");
    }
  };

  useEffect(() => {
    void fetchRows();
    const timer = setInterval(() => void fetchRows(), 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <ScrollArea className="h-full p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">HITL Inbox</h2>
            <p className="text-xs text-muted-foreground">sorted by deadline, then age</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void fetchRows()}>
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded border border-destructive/40 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {rows.length === 0 && !error && (
          <div className="rounded border border-dashed p-4 text-xs text-muted-foreground">
            No pending gates.
          </div>
        )}

        {rows.map((row) => (
          <div key={`${row.workflowID}:${row.gateKey}`} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="text-xs font-mono">{row.workflowID}</div>
                <div className="text-[10px] text-muted-foreground">
                  gate: {row.gateKey} | topic: {row.topic}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {row.slaStatus && (
                  <Badge
                    variant="outline"
                    className={
                      row.slaStatus === "CRITICAL"
                        ? "border-destructive/50 text-destructive"
                        : row.slaStatus === "WARNING"
                          ? "border-yellow-500/50 text-yellow-600"
                          : "border-green-500/50 text-green-600"
                    }
                  >
                    {row.slaStatus}
                  </Badge>
                )}
                {row.mismatchRisk === true && (
                  <Badge variant="outline" className="border-destructive/50 text-destructive">
                    topic mismatch risk
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground md:grid-cols-2">
              <span title={toIso(row.createdAt)}>
                created: {formatTime(row.createdAt)} ({formatRelative(row.createdAt)})
              </span>
              <span>
                deadline:{" "}
                {row.deadline
                  ? `${formatTime(row.deadline)} (${formatRelative(row.deadline)})`
                  : "none"}
              </span>
              <span>escalation: {row.escalationWorkflowID ?? "none"}</span>
            </div>
            <div className="mt-3">
              <Button
                size="sm"
                onClick={() =>
                  router.push(
                    `/?wid=${encodeURIComponent(row.workflowID)}&board=run&tab=gate&gate=${encodeURIComponent(row.gateKey)}`
                  )
                }
              >
                Open Gate
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
