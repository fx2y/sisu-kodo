"use client";

import { useEffect, useState } from "react";
import { Badge } from "@src/components/ui/badge";
import { Loader2, FileCode, CheckCircle2, RotateCcw, Clock, Hash, AlertCircle } from "lucide-react";
import type { PatchReviewRow } from "@src/server/ui-api";
import { formatTime } from "@src/lib/time";

export function PatchReviewPanel({ wid, stepId }: { wid: string; stepId: string }) {
  const [history, setHistory] = useState<PatchReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/runs/${wid}/steps/${stepId}/patches`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch patch history");
        return res.json();
      })
      .then((data) => {
        setHistory(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [wid, stepId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive font-medium">{error}</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm italic">
        No patch history found for this step.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FileCode className="h-3 w-3" />
          Patch Review
        </h3>
        <Badge variant="outline" className="text-[9px] h-4">
          {history.length} {history.length === 1 ? "Patch" : "Patches"}
        </Badge>
      </div>

      <div className="space-y-4">
        {history.map((patch) => (
          <div key={patch.patchIndex} className="rounded-lg border bg-card overflow-hidden">
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded">
                  #{patch.patchIndex}
                </span>
                <span
                  className="text-xs font-medium truncate max-w-[200px]"
                  title={patch.targetPath}
                >
                  {patch.targetPath.split("/").pop()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {patch.rolledBackAt ? (
                  <Badge variant="destructive" className="text-[9px] h-4 gap-1">
                    <RotateCcw className="w-2.5 h-2.5" />
                    ROLLED BACK
                  </Badge>
                ) : patch.appliedAt ? (
                  <Badge
                    variant="default"
                    className="text-[9px] h-4 gap-1 bg-green-600 hover:bg-green-600"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    APPLIED
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] h-4">
                    PENDING
                  </Badge>
                )}
              </div>
            </div>

            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Hash className="w-2.5 h-2.5" />
                    Pre-Hash
                  </div>
                  <div className="font-mono text-[10px] truncate" title={patch.preimageHash}>
                    {patch.preimageHash.substring(0, 12)}...
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Hash className="w-2.5 h-2.5" />
                    Post-Hash
                  </div>
                  <div className="font-mono text-[10px] truncate" title={patch.postimageHash}>
                    {patch.postimageHash.substring(0, 12)}...
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(patch.createdAt)}
                </div>
                {patch.appliedAt && !patch.rolledBackAt && (
                  <div className="text-green-600 font-medium">Verified Guard Pass</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
