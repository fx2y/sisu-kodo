"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@src/components/ui/card";
import { Badge } from "@src/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@src/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@src/components/ui/table";
import { Loader2, RefreshCw, BarChart3, Scale, Zap, ShieldAlert, Cpu, Activity } from "lucide-react";
import { Button } from "@src/components/ui/button";
import type { ThroughputResponse } from "@src/contracts/ops/throughput.schema";
import { formatTime } from "@src/lib/time";
import { Code2, ChevronDown, ChevronUp } from "lucide-react";

function SourceSnippet({ query }: { query: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-[10px] text-muted-foreground"
        onClick={() => setOpen(!open)}
      >
        <Code2 className="h-3 w-3 mr-1" />
        {open ? "Hide Source" : "Show Source"}
        {open ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
      </Button>
      {open && (
        <pre className="p-3 rounded bg-muted font-mono text-[9px] overflow-x-auto border">
          {query}
        </pre>
      )}
    </div>
  );
}

export function ThroughputBoard() {
  const [data, setData] = useState<ThroughputResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/ops/throughput");
      if (resp.ok) {
        const json = await resp.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch throughput data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background border-l">
      <div className="px-4 border-b shrink-0 flex items-center justify-between h-10">
        <h2 className="text-sm font-bold uppercase tracking-tight">Throughput Board</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="fairness" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 border-b shrink-0">
          <TabsList className="bg-transparent h-auto p-0 gap-4 overflow-x-auto whitespace-nowrap scrollbar-none">
            <TabsTrigger
              value="fairness"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              <Scale className="h-3 w-3 mr-1.5" />
              Fairness
            </TabsTrigger>
            <TabsTrigger
              value="priority"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              <Zap className="h-3 w-3 mr-1.5" />
              Priority
            </TabsTrigger>
            <TabsTrigger
              value="budgets"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              <ShieldAlert className="h-3 w-3 mr-1.5" />
              Budgets
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              <Cpu className="h-3 w-3 mr-1.5" />
              Templates
            </TabsTrigger>
            <TabsTrigger
              value="perf"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              <Activity className="h-3 w-3 mr-1.5" />
              Perf (k6)
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {loading && !data && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          <ScrollArea className="h-full">
            <div className="p-4 space-y-6">
              <TabsContent value="fairness" className="m-0 space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-1">
                    <Badge variant="secondary" className="text-[10px] font-mono h-5">
                      sysdb app.v_ops_queue_fairness
                    </Badge>
                    <span className="text-[10px] text-muted-foreground italic">
                      Lane split by partition key
                    </span>
                  </div>
                  <SourceSnippet
                    query={`SELECT queue_name, queue_partition_key, status, count(*)
FROM dbos.workflow_status
GROUP BY 1, 2, 3;`}
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Queue</TableHead>
                      <TableHead>Partition Key</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.fairness.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">{row.queueName}</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[150px]">
                          {row.partitionKey}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold">{row.workflowCount}</TableCell>
                      </TableRow>
                    ))}
                    {data?.fairness.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center italic text-muted-foreground">
                          No active partitions
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="priority" className="m-0 space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-1">
                    <Badge variant="secondary" className="text-[10px] font-mono h-5">
                      sysdb app.v_ops_queue_priority
                    </Badge>
                    <span className="text-[10px] text-muted-foreground italic">
                      Priority latency monitoring
                    </span>
                  </div>
                  <SourceSnippet
                    query={`SELECT queue_name, priority, status, avg(latency)
FROM dbos.workflow_status
GROUP BY 1, 2, 3;`}
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Queue</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Avg Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.priority.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">{row.queueName}</TableCell>
                        <TableCell className="font-bold">{row.priority}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{row.workflowCount}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {row.avgLatencyMs ? `${row.avgLatencyMs.toFixed(1)}ms` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {data?.priority.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center italic text-muted-foreground">
                          No priority data
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="budgets" className="m-0 space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <Badge variant="secondary" className="text-[10px] font-mono h-5">
                    app.artifacts(step_id='BUDGET')
                  </Badge>
                  <span className="text-[10px] text-muted-foreground italic">
                    Runtime limit violations
                  </span>
                </div>
                <div className="space-y-3">
                  {data?.budgets.map((row, idx) => (
                    <Card key={idx} className="border-destructive/30 bg-destructive/5">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase text-destructive flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" />
                            {row.outcome}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(row.ts)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">Run ID</p>
                            <p className="font-mono text-[10px] truncate">{row.runId}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">Metric</p>
                            <p className="font-bold text-xs">{row.metric}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">Limit</p>
                            <p className="text-xs">{row.limit}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">Observed</p>
                            <p className="text-xs text-destructive font-bold">{row.observed}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {data?.budgets.length === 0 && (
                    <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground italic">
                      No budget violations recorded
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="templates" className="m-0 space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <Badge variant="secondary" className="text-[10px] font-mono h-5">
                    app.sbx_templates ∩ app.sbx_runs
                  </Badge>
                  <span className="text-[10px] text-muted-foreground italic">
                    Sandbox template performance
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipe</TableHead>
                      <TableHead>Template Key</TableHead>
                      <TableHead className="text-right">Runs</TableHead>
                      <TableHead className="text-right">Avg Boot</TableHead>
                      <TableHead className="text-right">Avg Exec</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.templates.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">
                          {row.recipeId}
                          <span className="text-muted-foreground ml-1">v{row.recipeV}</span>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] truncate max-w-[120px]">
                          {row.templateKey}
                        </TableCell>
                        <TableCell className="text-right">{row.runCount}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {row.avgBootMs ? `${row.avgBootMs.toFixed(0)}ms` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {row.avgExecMs ? `${row.avgExecMs.toFixed(0)}ms` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {data?.templates.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center italic text-muted-foreground">
                          No template stats recorded
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="perf" className="m-0 space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <Badge variant="secondary" className="text-[10px] font-mono h-5">
                    .tmp/k6/*-summary.json
                  </Badge>
                  <span className="text-[10px] text-muted-foreground italic">
                    k6 performance gate results
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data?.k6.map((row, idx) => (
                    <Card key={idx} className={row.pass ? "border-green-500/30" : "border-red-500/30"}>
                      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-bold uppercase">{row.name}</CardTitle>
                        <Badge variant={row.pass ? "default" : "destructive"} className="uppercase text-[9px]">
                          {row.pass ? "PASS" : "FAIL"}
                        </Badge>
                      </CardHeader>
                      <CardContent className="py-3 px-4">
                        <div className="grid grid-cols-2 gap-y-3">
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">p95</p>
                            <p className="font-bold text-lg">{row.p95.toFixed(1)}ms</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-muted-foreground">p99</p>
                            <p className="font-medium text-muted-foreground">{row.p99.toFixed(1)}ms</p>
                          </div>
                          <div className="col-span-2 pt-2 border-t">
                            <p className="text-[9px] uppercase text-muted-foreground">Threshold</p>
                            <p className="text-[10px] font-mono truncate">{row.threshold}</p>
                          </div>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-3 text-right italic">
                          {formatTime(row.ts)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                  {data?.k6.length === 0 && (
                    <div className="col-span-full text-center p-8 border border-dashed rounded-lg text-muted-foreground italic">
                      No k6 summaries found in .tmp/k6
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </div>
      </Tabs>
    </div>
  );
}
