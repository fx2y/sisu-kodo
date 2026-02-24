"use client";

import { useState } from "react";
import { TimelineLive } from "./timeline-live";
import { ArtifactSheet } from "./artifact-sheet";
import { ProofPanel } from "./proof-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@src/components/ui/tabs";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Badge } from "@src/components/ui/badge";

const TAB_VALUES = new Set(["timeline", "gate", "artifacts"]);

export function TimelineContainer({ wid, initialTab }: { wid?: string; initialTab?: string }) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const defaultTab =
    typeof initialTab === "string" && TAB_VALUES.has(initialTab) ? initialTab : "timeline";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <Tabs defaultValue={defaultTab} className="flex flex-col h-full">
        <div className="px-4 border-b shrink-0 flex items-center h-10">
          <TabsList className="bg-transparent h-auto p-0 gap-4">
            <TabsTrigger
              value="timeline"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              Timeline
            </TabsTrigger>
            <TabsTrigger
              value="gate"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              Gate
            </TabsTrigger>
            <TabsTrigger
              value="artifacts"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              Artifacts
            </TabsTrigger>
            <TabsTrigger
              value="proof"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              Proof
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <TabsContent value="timeline" className="m-0 h-full">
            {wid ? (
              <TimelineLive wid={wid} onSelectArtifact={(id) => setSelectedArtifactId(id)} />
            ) : (
              <ScrollArea className="h-full p-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50 opacity-50 grayscale italic">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">WAITING</Badge>
                    <span className="text-sm font-medium">Timeline empty</span>
                  </div>
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="gate" className="m-0 h-full">
            {wid ? (
              <TimelineLive wid={wid} onSelectArtifact={(id) => setSelectedArtifactId(id)} />
            ) : (
              <ScrollArea className="h-full p-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50 opacity-50 grayscale italic">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">WAITING</Badge>
                    <span className="text-sm font-medium">No active gate</span>
                  </div>
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="artifacts" className="m-0 h-full">
            <ScrollArea className="h-full p-4">
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm italic">
                {wid ? "Select a step to view artifacts." : "No artifacts generated yet."}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="proof" className="m-0 h-full">
            {wid ? (
              <ProofPanel wid={wid} />
            ) : (
              <ScrollArea className="h-full p-4">
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm italic">
                  Start a workflow to view proofs.
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <ArtifactSheet artifactId={selectedArtifactId} onClose={() => setSelectedArtifactId(null)} />
    </div>
  );
}
