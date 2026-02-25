"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@src/components/ui/tabs";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Badge } from "@src/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@src/components/ui/card";
import {
  Loader2,
  ExternalLink,
  ShieldCheck,
  Database,
  Zap,
  FileText,
  Download
} from "lucide-react";
import type { ProofCard } from "@src/contracts/ui/proof-card.schema";
import { assertProofCard } from "@src/contracts/ui/proof-card.schema";
import { toIso } from "@src/lib/time";

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  sql: <Database className="h-4 w-4" />,
  api: <Zap className="h-4 w-4" />,
  dbos: <ShieldCheck className="h-4 w-4" />,
  artifact: <FileText className="h-4 w-4" />,
  k6: <Zap className="h-4 w-4" />,
  policy: <ShieldCheck className="h-4 w-4" />,
  test: <FileText className="h-4 w-4" />
};

export function ProofPanel({ wid }: { wid: string }) {
  const [cards, setCards] = useState<ProofCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProofs() {
      try {
        setLoading(true);
        const res = await fetch(`/api/runs/${wid}/proofs`);
        if (!res.ok) throw new Error("Failed to fetch proofs");
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(assertProofCard);
        }
        setCards(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchProofs();
  }, [wid]);

  const filterCards = (source?: string, isX1?: boolean) => {
    return cards.filter((c) => {
      if (isX1) return c.provenance === "app.run_steps";
      if (source === "SQL(app)") return c.source === "sql" && c.provenance.startsWith("app.");
      if (source === "SQL(dbos)")
        return c.source === "dbos" || (c.source === "sql" && c.provenance.startsWith("dbos."));
      if (source === "API") return c.source === "api";
      return true;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-destructive text-sm italic">Error loading proofs: {error}</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Tabs defaultValue="api" className="flex flex-col h-full">
        <div className="px-4 border-b shrink-0 flex items-center h-10 bg-muted/30">
          <TabsList className="bg-transparent h-auto p-0 gap-4">
            {[
              { id: "api", label: "API" },
              { id: "sql-app", label: "SQL(app)" },
              { id: "sql-dbos", label: "SQL(dbos)" },
              { id: "x1", label: "x1" },
              { id: "policy", label: "Policy" },
              { id: "repro", label: "Repro" },
              { id: "triage", label: "Triage" }
            ].map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="text-[10px] uppercase tracking-wider font-bold rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <TabsContent value="api" className="m-0 space-y-4">
              <ProofList cards={filterCards("API")} />
            </TabsContent>
            <TabsContent value="sql-app" className="m-0 space-y-4">
              <ProofList cards={filterCards("SQL(app)")} />
            </TabsContent>
            <TabsContent value="sql-dbos" className="m-0 space-y-4">
              <ProofList cards={filterCards("SQL(dbos)")} />
            </TabsContent>
            <TabsContent value="x1" className="m-0 space-y-4">
              <ProofList cards={filterCards(undefined, true)} />
            </TabsContent>
            <TabsContent value="policy" className="m-0 space-y-4">
              <ProofList cards={cards.filter((c) => c.source === "policy" || c.source === "k6")} />
            </TabsContent>
            <TabsContent value="repro" className="m-0 space-y-4">
              <ReproTab wid={wid} />
            </TabsContent>
            <TabsContent value="triage" className="m-0 space-y-4">
              <TriageTab wid={wid} />
            </TabsContent>
          </ScrollArea>
        </div>
      </Tabs>
    </div>
  );
}

function ProofList({ cards }: { cards: ProofCard[] }) {
  if (cards.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic p-2">
        No evidence found for this category.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cards.map((card, i) => (
        <Card key={i} className="shadow-none border-muted">
          <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              {SOURCE_ICONS[card.source] || <FileText className="h-4 w-4" />}
              {card.claim}
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono uppercase">
              {card.source}
            </Badge>
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-2">
            <div className="text-xs text-muted-foreground font-mono break-all bg-muted/50 p-2 rounded border border-muted-foreground/10">
              {card.evidence}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="font-mono">Provenance: {card.provenance}</span>
              <span>{toIso(card.sourceTs ?? card.ts)}</span>
            </div>
            {(card.rawRef || card.id) && (
              <div className="flex justify-end pt-1">
                <Badge
                  variant="secondary"
                  className="text-[9px] cursor-pointer hover:bg-secondary/80 flex items-center gap-1"
                  onClick={() => {
                    if (card.rawRef) window.open(card.rawRef, "_blank");
                  }}
                >
                  <ExternalLink className="h-2 w-2" />
                  RAW REF {card.id && `(${card.id})`}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReproTab({ wid }: { wid: string }) {
  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/runs/${wid}/repro`);
      if (!res.ok) throw new Error("Repro pack generation failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `repro-${wid}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-dashed shadow-none">
        <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <Download className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-sm">One-Click Repro Pack</h3>
            <p className="text-xs text-muted-foreground max-w-xs mt-1">
              Download a complete snapshot of this run including app DB, DBOS status, artifacts, and
              evaluation results.
            </p>
          </div>
          <button
            onClick={handleDownload}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            DOWNLOAD REPRO-PACK.JSON
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function TriageTab({ wid }: { wid: string }) {
  const snippets = [
    {
      label: "Inspect Run (SQL)",
      cmd: `SELECT * FROM app.runs WHERE id = '${wid}' OR workflow_id = '${wid}';`
    },
    {
      label: "Check Steps (SQL)",
      cmd: `SELECT * FROM app.run_steps WHERE run_id = (SELECT id FROM app.runs WHERE workflow_id = '${wid}' OR id = '${wid}' LIMIT 1);`
    },
    { label: "Fetch Proofs (API)", cmd: `curl -X GET "/api/runs/${wid}/proofs"` },
    {
      label: "Get Repro Pack (API)",
      cmd: `curl -X GET "/api/runs/${wid}/repro" -o repro-${wid}.json`
    }
  ];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
          Triage Checklist
        </h3>
        <div className="space-y-2">
          {[
            "1. /healthz liveness & worker parity",
            "2. run/gate API response & latency",
            "3. app SQL intent & run status",
            "4. dbos SQL workflow status SUCCESS",
            "5. repro-pack consistent export",
            "6. logs last resort (informational)"
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-2 rounded border bg-card/50 text-xs shadow-sm"
            >
              <div className="h-4 w-4 rounded border border-primary/20 flex-shrink-0 mt-0.5 bg-primary/5" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
          Oracle Snippets
        </h3>
        <div className="space-y-2">
          {snippets.map((s, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  {s.label}
                </span>
                <button
                  onClick={() => copyToClipboard(s.cmd)}
                  className="text-[9px] font-bold text-primary hover:underline"
                >
                  COPY
                </button>
              </div>
              <pre className="text-[10px] bg-muted p-2 rounded border font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {s.cmd}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
