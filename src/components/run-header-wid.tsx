"use client";

import { useSearchParams } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@src/lib/utils";
import { RunHeader } from "@src/contracts/ui/run-header.schema";
import { PostureBadgeSet } from "./posture-badges";

export function RunHeaderWid({
  posture
}: {
  posture?: Partial<RunHeader>;
}) {
  const searchParams = useSearchParams();
  const wid = searchParams.get("wid") || "none";
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    if (wid === "none") return;
    await navigator.clipboard.writeText(wid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-4">
      {posture && <PostureBadgeSet posture={posture} className="hidden md:flex" />}
      <div
        onClick={copyToClipboard}
        className={cn(
          "flex items-center gap-2 bg-muted px-3 py-1 rounded-md border text-sm font-mono group cursor-pointer hover:bg-accent transition-colors",
          wid === "none" && "opacity-50 cursor-not-allowed hover:bg-muted"
        )}
      >
        <span className="text-muted-foreground/50">wid:</span>
        <span className="max-w-[120px] truncate">{wid}</span>
        <div className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors">
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </div>
    </div>
  );
}
