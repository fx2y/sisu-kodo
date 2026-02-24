"use client";

import { useEffect, useState } from "react";
import type { SignoffBoardResponse } from "@src/contracts/ui/signoff-board.schema";
import type { SignoffTile } from "@src/contracts/ui/signoff-tile.schema";
import { Card, CardHeader, CardTitle, CardContent } from "@src/components/ui/card";
import { Badge } from "@src/components/ui/badge";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { AlertCircle, CheckCircle2, XCircle, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@src/lib/utils";
import { PostureBadges } from "./posture-badges";
import { DemoHelper } from "./demo-helper";
import { toIso } from "@src/lib/time";

export function SignoffBoard() {
  const [data, setData] = useState<SignoffBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ops/signoff")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse italic">
        Loading signoff status...
      </div>
    );
  if (error)
    return (
      <div className="p-8">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-center text-destructive">
            <AlertCircle className="mx-auto mb-2 h-8 w-8" />
            <p className="font-bold">Signoff Board Error</p>
            <p className="text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  if (!data) return null;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-8 max-w-5xl mx-auto">
        {/* Top Banner: Binary Verdict */}
        <div
          className={cn(
            "flex items-center justify-between p-8 rounded-xl border-2 transition-all shadow-lg",
            data.verdict === "GO"
              ? "bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400"
              : "bg-red-500/10 border-red-500/50 text-red-700 dark:text-red-400"
          )}
        >
          <div className="flex items-center gap-6">
            {data.verdict === "GO" ? <CheckCircle2 size={64} /> : <XCircle size={64} />}
            <div>
              <h1 className="text-5xl font-black tracking-tighter uppercase">{data.verdict}</h1>
              <p className="text-lg opacity-80 font-medium tracking-tight">
                System Signoff Verdict
              </p>
            </div>
          </div>
          <div className="text-right space-y-2">
            <PostureBadges header={data.posture} />
            <p className="text-xs font-mono opacity-60">appVersion: {data.posture.appVersion}</p>
          </div>
        </div>

        {/* PF Strip */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary/40" />
              Proof Floor (PF) Strip
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {data.pfTiles.map((tile) => (
              <SignoffTileCard key={tile.id} tile={tile} />
            ))}
          </div>
        </section>

        {/* Mandatory Proof Strip */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500/40" />
              Mandatory Proof Strip
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.proofTiles.map((tile) => (
              <SignoffTileCard key={tile.id} tile={tile} />
            ))}
          </div>
        </section>

        {/* Rollback Trigger Strip */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500/40" />
              Rollback Trigger Strip
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.rollbackTriggers.map((tile) => (
              <SignoffTileCard
                key={tile.id}
                tile={tile}
                className={cn(tile.verdict === "NO_GO" && "border-red-500/50 bg-red-500/5")}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4 pt-4">
          <DemoHelper />
        </section>

        <footer className="pt-8 text-center border-t">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
            deterministic oracle timestamp: {toIso(data.ts)}
          </p>
        </footer>
      </div>
    </ScrollArea>
  );
}

function SignoffTileCard({ tile, className }: { tile: SignoffTile; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isGo = tile.verdict === "GO";

  return (
    <Card className={cn("transition-all hover:shadow-md overflow-hidden", className)}>
      <CardHeader
        className="p-4 flex flex-row items-center justify-between space-y-0 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {isGo ? (
            <CheckCircle2 className="text-green-500 shrink-0" size={18} />
          ) : (
            <XCircle className="text-red-500 shrink-0" size={18} />
          )}
          <CardTitle className="text-xs font-bold truncate tracking-tight uppercase">
            {tile.label}
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isGo ? "outline" : "destructive"}
            className="text-[9px] h-4 px-1 leading-none uppercase"
          >
            {tile.verdict}
          </Badge>
          {expanded ? (
            <ChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="p-4 pt-0 border-t bg-muted/20">
          <div className="space-y-3 py-3">
            {tile.reason && (
              <p className="text-xs text-muted-foreground italic leading-relaxed">{tile.reason}</p>
            )}
            {tile.evidenceRefs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Evidence Pointers
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tile.evidenceRefs.map((ref) => (
                    <Badge
                      key={ref}
                      variant="secondary"
                      className="font-mono text-[9px] bg-background border py-0 h-4"
                    >
                      {ref}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {!tile.reason && tile.evidenceRefs.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic italic">
                Deterministic pass: No issues found.
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
