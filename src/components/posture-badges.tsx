import { Badge } from "@src/components/ui/badge";
import { cn } from "@src/lib/utils";
import type { RunHeader } from "@src/contracts/ui/run-header.schema";

export function PostureBadges({
  header,
  className
}: {
  header: Partial<RunHeader>;
  className?: string;
}) {
  const { topology, ocMode, sbxMode, sbxProvider, appVersion, claimScope } = header;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {topology && (
        <Badge
          variant="outline"
          className="text-[9px] h-4 uppercase font-bold tracking-tight px-1.5 border-blue-500/20 text-blue-600 bg-blue-500/5"
        >
          {topology}
        </Badge>
      )}
      {ocMode && (
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-4 uppercase font-bold tracking-tight px-1.5",
            ocMode === "live"
              ? "border-red-500/20 text-red-600 bg-red-500/5"
              : "border-yellow-500/20 text-yellow-600 bg-yellow-500/5"
          )}
        >
          OC:{ocMode}
        </Badge>
      )}
      {sbxMode && (
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-4 uppercase font-bold tracking-tight px-1.5",
            sbxMode === "live"
              ? "border-green-500/20 text-green-600 bg-green-500/5"
              : "border-muted-foreground/20 text-muted-foreground bg-muted"
          )}
        >
          SBX:{sbxMode} {sbxProvider && `(${sbxProvider})`}
        </Badge>
      )}
      {appVersion && (
        <Badge
          variant="outline"
          className="text-[9px] h-4 font-mono tracking-tight px-1.5 border-border text-muted-foreground"
        >
          {appVersion}
        </Badge>
      )}
      {claimScope && (
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-4 uppercase font-bold tracking-tight px-1.5",
            claimScope === "signoff"
              ? "border-purple-500/20 text-purple-600 bg-purple-500/5"
              : "border-orange-500/20 text-orange-600 bg-orange-500/5"
          )}
        >
          {claimScope}
        </Badge>
      )}
    </div>
  );
}
