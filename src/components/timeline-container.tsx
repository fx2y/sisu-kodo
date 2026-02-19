"use client";

import { useState } from "react";
import { TimelineLive } from "./timeline-live";
import { ArtifactSheet } from "./artifact-sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@src/components/ui/tabs";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Badge } from "@src/components/ui/badge";

export function TimelineContainer({ wid }: { wid?: string }) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <Tabs defaultValue="timeline" className="flex flex-col h-full">
        <div className="px-4 border-b shrink-0 flex items-center h-10">
          <TabsList className="bg-transparent h-auto p-0 gap-4">
            <TabsTrigger
              value="timeline"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              Timeline
            </TabsTrigger>
            <TabsTrigger
              value="artifacts"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              Artifacts
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

          <TabsContent value="artifacts" className="m-0 h-full">
            <ScrollArea className="h-full p-4">
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm italic">
                {wid ? "Select a step to view artifacts." : "No artifacts generated yet."}
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>

      <ArtifactSheet artifactId={selectedArtifactId} onClose={() => setSelectedArtifactId(null)} />
    </div>
  );
}
