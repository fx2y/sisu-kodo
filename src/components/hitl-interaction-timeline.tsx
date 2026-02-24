"use client";

import type { HitlInteractionRow } from "@src/contracts/ui/hitl-interaction-row.schema";
import { formatRelative, formatTime } from "@src/lib/time";
import { Badge } from "@src/components/ui/badge";

export function HitlInteractionTimeline({ rows }: { rows: HitlInteractionRow[] }) {
  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No interactions recorded yet.</div>;
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Interaction Timeline
      </div>
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={`${row.gateKey}:${row.dedupeKey}:${idx}`} className="rounded border bg-muted/20 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                {row.origin}
              </Badge>
              <span className="text-[10px] font-mono">{row.gateKey}</span>
              <span className="text-[10px] text-muted-foreground">{row.topic}</span>
            </div>
            <div className="mt-1 grid gap-1 text-[10px] font-mono text-muted-foreground md:grid-cols-2">
              <span>dedupe: {row.dedupeKey}</span>
              <span>hash: {row.payloadHash.slice(0, 16)}...</span>
              <span title={new Date(row.createdAt).toISOString()}>
                at: {formatTime(row.createdAt)} ({formatRelative(row.createdAt)})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
