import { Badge } from "@src/components/ui/badge";
import { ShieldAlert, ShieldCheck, ShieldEllipsis } from "lucide-react";
import { cn } from "@src/lib/utils";

const CLAIMS: Record<
  string,
  { label: string; description: string; color: string; icon: typeof ShieldCheck }
> = {
  signoff: {
    label: "SIGNOFF",
    description: "Final signoff tree. DBOS exactly-once law + SQL oracle proof mandatory.",
    color: "text-purple-600 bg-purple-500/10 border-purple-500/20",
    icon: ShieldCheck
  },
  "live-smoke": {
    label: "LIVE-SMOKE",
    description: "Live infrastructure smoke test. Unsafe for production workflows.",
    color: "text-orange-600 bg-orange-500/10 border-orange-500/20",
    icon: ShieldAlert
  },
  demo: {
    label: "DEMO",
    description: "Operator-first demo. Deterministic replay and persistence active.",
    color: "text-blue-600 bg-blue-500/10 border-blue-500/20",
    icon: ShieldEllipsis
  }
};

export function ClaimScopeBanner({ scope }: { scope: "signoff" | "demo" | "live-smoke" }) {
  const claim = CLAIMS[scope] || CLAIMS.demo;
  const Icon = claim.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-1.5 border-b text-[11px] leading-tight shrink-0",
        claim.color
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="flex-1 flex items-baseline gap-2">
        <span className="font-bold tracking-widest whitespace-nowrap">
          {claim.label} CLAIM ACTIVE:
        </span>
        <span className="font-medium">{claim.description}</span>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "text-[9px] h-4 uppercase font-bold tracking-tight px-1.5 bg-background/50",
          claim.color
        )}
      >
        {scope}
      </Badge>
    </div>
  );
}
