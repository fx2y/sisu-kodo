"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@src/components/ui/sheet";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Badge } from "@src/components/ui/badge";
import { Loader2, Download, Copy, ExternalLink } from "lucide-react";
import { Button } from "@src/components/ui/button";

export function ArtifactSheet({ 
  artifactId, 
  onClose 
}: { 
  artifactId: string | null; 
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<string | null>(null);

  useEffect(() => {
    if (artifactId) {
      setLoading(true);
      fetch(`/api/artifacts/${encodeURIComponent(artifactId)}`, { cache: "no-store" })
        .then(async (res) => {
          setType(res.headers.get("content-type"));
          const text = await res.text();
          setContent(text);
        })
        .catch((err) => console.error("Artifact fetch error:", err))
        .finally(() => setLoading(false));
    } else {
      setContent(null);
      setType(null);
    }
  }, [artifactId]);

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
    }
  };

  const handleDownload = () => {
    if (!content || !artifactId) return;
    const blob = new Blob([content], { type: type || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifactId.split("/").pop() || "artifact";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={!!artifactId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <SheetTitle className="flex items-center gap-2">
                Artifact Viewer
                {type && <Badge variant="secondary" className="text-[10px]">{type}</Badge>}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs truncate max-w-[400px]">
                {artifactId}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
               <Button size="icon" variant="outline" onClick={handleCopy} disabled={!content}>
                 <Copy className="w-4 h-4" />
               </Button>
               <Button size="icon" variant="outline" onClick={handleDownload} disabled={!content}>
                 <Download className="w-4 h-4" />
               </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-hidden relative bg-muted/30">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : content ? (
            <ScrollArea className="h-full p-6">
              {type?.includes("application/json") ? (
                <pre className="text-xs font-mono p-4 rounded bg-background border">
                  {content.startsWith("{") || content.startsWith("[") ? JSON.stringify(JSON.parse(content), null, 2) : content}
                </pre>
              ) : type?.includes("image/svg+xml") ? (
                <div className="flex justify-center p-4 rounded bg-background border overflow-auto" dangerouslySetInnerHTML={{ __html: content }} />
              ) : type?.includes("image/") ? (
                <div className="flex justify-center p-4 rounded bg-background border">
                   <img src={`/api/artifacts/${encodeURIComponent(artifactId)}`} alt="Artifact" className="max-w-full h-auto" />
                </div>
              ) : artifactId?.includes("none") ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2 border rounded bg-background/50 border-dashed">
                   <Package className="w-8 h-8 opacity-20" />
                   <span className="italic text-sm">No artifacts produced by this step.</span>
                </div>
              ) : (
                <pre className="text-xs font-mono p-4 rounded bg-background border whitespace-pre-wrap">
                  {content}
                </pre>
              )}
            </ScrollArea>
          ) : (
             <div className="absolute inset-0 flex items-center justify-center text-muted-foreground italic text-sm">
                Failed to load artifact content.
             </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
