import { ShieldAlert, ShieldCheck, Activity } from "lucide-react";
import { Badge } from "@src/components/ui/badge";
import type { RunHeader } from "@src/contracts/ui/run-header.schema";
import { cn } from "@src/lib/utils";

export function LiveSmokePostureCard({ header }: { header: RunHeader }) {
  const isLiveSmoke = header.claimScope === "live-smoke";
  const ocLive = header.ocMode === "live";
  const sbxLive = header.sbxMode === "live";
  const strictMode = header.ocStrictMode;

  if (!isLiveSmoke) return null;

  return (
    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-orange-600">
          <Activity className="h-5 w-5" />
          <h3 className="font-semibold text-sm">Live Smoke Posture</h3>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] h-4 font-bold uppercase",
            strictMode
              ? "border-green-500/40 text-green-600"
              : "border-orange-500/40 text-orange-600"
          )}
        >
          {strictMode ? "STRICT MODE" : "PERMISSIVE"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 p-2 rounded border bg-background/50">
          {ocLive ? (
            <ShieldCheck className="h-4 w-4 text-green-500" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-orange-500" />
          )}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">
              OC Provider
            </span>
            <span className="text-xs font-medium">
              {ocLive ? "Live (Connected)" : "Stub (Replay)"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded border bg-background/50">
          {sbxLive ? (
            <ShieldCheck className="h-4 w-4 text-green-500" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-orange-500" />
          )}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">
              SBX Provider
            </span>
            <span className="text-xs font-medium">
              {sbxLive ? `Live (${header.sbxProvider})` : "Mock"}
            </span>
          </div>
        </div>
      </div>

      {!strictMode && isLiveSmoke && (
        <div className="text-[10px] text-orange-700 bg-orange-500/10 p-2 rounded border border-orange-500/20 italic">
          <strong>Non-signoff posture:</strong> OC_STRICT_MODE=1 is required for official live-smoke
          signoff evidence.
        </div>
      )}
    </div>
  );
}
