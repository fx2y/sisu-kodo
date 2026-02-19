import { Badge } from "@src/components/ui/badge";
import { Card, CardContent } from "@src/components/ui/card";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@src/components/ui/tabs";

export default function Home() {
  return (
    <div className="grid grid-cols-[minmax(320px,1fr)_minmax(420px,1fr)] h-full overflow-hidden">
      {/* Left Column: Chat / Control Pane */}
      <div className="flex flex-col border-r h-full overflow-hidden bg-card/50">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-2xl mx-auto">
            <Card className="border-dashed">
              <CardContent className="pt-6 text-center text-muted-foreground">
                <p>Welcome to Sisu Kodo.</p>
                <p className="text-sm">Start a new workflow to see the timeline.</p>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        {/* Chat Input Placeholder */}
        <div className="p-4 border-t bg-card">
          <div className="max-w-2xl mx-auto relative">
            <div className="h-10 w-full bg-muted animate-pulse rounded-md" />
            <div className="absolute right-2 top-2 h-6 w-16 bg-primary/20 rounded-md" />
          </div>
        </div>
      </div>

      {/* Right Column: Timeline / Artifacts Pane */}
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
              <ScrollArea className="h-full p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50 opacity-50 grayscale italic">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">WAITING</Badge>
                      <span className="text-sm font-medium">Timeline empty</span>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="artifacts" className="m-0 h-full">
              <ScrollArea className="h-full p-4">
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm italic">
                  No artifacts generated yet.
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
