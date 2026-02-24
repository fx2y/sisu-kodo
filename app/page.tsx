import { ChatInput } from "@src/components/chat-input";
import { TimelineContainer } from "@src/components/timeline-container";
import { HitlInboxBoard } from "@src/components/hitl-inbox-board";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Card, CardContent } from "@src/components/ui/card";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ wid?: string; board?: string; tab?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const { wid, board, tab } = await searchParams;
  const activeBoard = board === "hitl-inbox" ? "hitl-inbox" : "run";

  return (
    <div className="grid grid-cols-[minmax(320px,1fr)_minmax(420px,1fr)] h-full overflow-hidden">
      {/* Left Column: Chat / Control Pane */}
      <div className="flex flex-col border-r h-full overflow-hidden bg-card/50">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-2xl mx-auto">
            {!wid && (
              <Card className="border-dashed">
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <p>Welcome to Sisu Kodo.</p>
                  <p className="text-sm">Start a new workflow to see the timeline.</p>
                </CardContent>
              </Card>
            )}
            {wid && (
              <div className="space-y-4">
                {/* Intent/Chat history could go here */}
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-sm text-muted-foreground mb-1 font-medium uppercase tracking-wider">
                    Active Workflow
                  </p>
                  <p className="font-mono text-sm break-all font-bold">{wid}</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Chat Input */}
        <div className="p-4 border-t bg-card">
          <div className="max-w-2xl mx-auto">
            <ChatInput initialWid={wid} />
          </div>
        </div>
      </div>

      {/* Right Column: Timeline / Artifacts Pane (Container) */}
      {activeBoard === "hitl-inbox" ? <HitlInboxBoard /> : <TimelineContainer wid={wid} initialTab={tab} />}
    </div>
  );
}
