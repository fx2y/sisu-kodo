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
import type { OpsWorkflowSummary } from "@src/contracts/ops/list.schema";
import type { WorkflowStepSummary } from "@src/contracts/ops/steps.schema";
import type { QueueDepthRow } from "@src/contracts/ops/queue-depth.schema";
import type { OpsAuditRow } from "@src/contracts/ops/audit.schema";
import { Loader2, RefreshCw, Play, Square, GitFork, Shield } from "lucide-react";
import { Button } from "@src/components/ui/button";
import { OpsActionDrawer } from "./ops-action-drawer";

import { formatTime, parseIso, toIso } from "@src/lib/time";

type OpsAction = "cancel" | "resume" | "fork";

export function OpsBoard() {
  const [workflows, setWorkflows] = useState<OpsWorkflowSummary[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [selectedWid, setSelectedWid] = useState<string | null>(null);
  const [workflowDetail, setWorkflowDetail] = useState<OpsWorkflowSummary | null>(null);
  const [steps, setSteps] = useState<WorkflowStepSummary[]>([]);
  const [audit, setAudit] = useState<OpsAuditRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [queueDepth, setQueueDepth] = useState<QueueDepthRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);

  // Drawer state
  const [drawerAction, setDrawerAction] = useState<OpsAction | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchWorkflows = async () => {
    setLoadingWorkflows(true);
    try {
      const resp = await fetch("/api/ops/wf");
      if (resp.ok) {
        const data = await resp.json();
        setWorkflows(data);
      }
    } catch (err) {
      console.error("Failed to fetch workflows", err);
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const fetchQueueDepth = async () => {
    setLoadingQueue(true);
    try {
      const resp = await fetch("/api/ops/queue-depth");
      if (resp.ok) {
        const data = await resp.json();
        setQueueDepth(data);
      }
    } catch (err) {
      console.error("Failed to fetch queue depth", err);
    } finally {
      setLoadingQueue(false);
    }
  };

  const fetchDetail = async (wid: string) => {
    setLoadingDetail(true);
    try {
      const [wResp, sResp] = await Promise.all([
        fetch(`/api/ops/wf/${wid}`),
        fetch(`/api/ops/wf/${wid}/steps`)
      ]);
      if (wResp.ok && sResp.ok) {
        const detail = await wResp.json();
        setWorkflowDetail(detail);
        setSteps(await sResp.json());
        setAudit(detail.audit || []);
      }
    } catch (err) {
      console.error("Failed to fetch workflow detail", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
    fetchQueueDepth();
  }, []);

  useEffect(() => {
    if (selectedWid) {
      fetchDetail(selectedWid);
    }
  }, [selectedWid]);

  const openDrawer = (action: OpsAction) => {
    setDrawerAction(action);
    setIsDrawerOpen(true);
  };

  const maxStepN = Math.max(0, ...steps.map((s) => s.functionId));

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background border-l">
      <div className="px-4 border-b shrink-0 flex items-center justify-between h-10">
        <h2 className="text-sm font-bold uppercase tracking-tight">Ops Console</h2>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              fetchWorkflows();
              fetchQueueDepth();
              if (selectedWid) fetchDetail(selectedWid);
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="list" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 border-b shrink-0">
          <TabsList className="bg-transparent h-auto p-0 gap-4">
            <TabsTrigger
              value="list"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              Workflows
            </TabsTrigger>
            <TabsTrigger
              value="queues"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-10"
            >
              Queues
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="list" className="flex-1 overflow-hidden m-0">
          <div className="grid grid-cols-2 h-full">
            <div className="border-r flex flex-col overflow-hidden">
              <ScrollArea className="flex-1">
                {loadingWorkflows ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Workflow ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workflows.map((wf) => (
                        <TableRow
                          key={wf.workflowID}
                          className={`cursor-pointer ${selectedWid === wf.workflowID ? "bg-accent" : ""}`}
                          onClick={() => setSelectedWid(wf.workflowID)}
                        >
                          <TableCell className="font-mono text-xs truncate max-w-[120px]">
                            {wf.workflowID}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                wf.status === "SUCCESS"
                                  ? "default"
                                  : wf.status === "ERROR"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {wf.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatTime(wf.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </div>
            <div className="flex flex-col overflow-hidden bg-card/30">
              <ScrollArea className="flex-1">
                {!selectedWid ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm italic p-8">
                    Select a workflow to view details
                  </div>
                ) : loadingDetail ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="p-4 space-y-6">
                    <section className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold uppercase text-muted-foreground mb-1">
                          Workflow Info
                        </h3>
                        <p className="font-mono text-xs font-bold">{selectedWid}</p>
                      </div>
                      <div className="flex gap-2">
                        {["PENDING", "ENQUEUED"].includes(workflowDetail?.status || "") && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8"
                            onClick={() => openDrawer("cancel")}
                          >
                            <Square className="h-3 w-3 mr-1 fill-current" />
                            Cancel
                          </Button>
                        )}
                        {["CANCELLED", "ENQUEUED"].includes(workflowDetail?.status || "") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-blue-500/50 text-blue-600 hover:bg-blue-50"
                            onClick={() => openDrawer("resume")}
                          >
                            <Play className="h-3 w-3 mr-1 fill-current" />
                            Resume
                          </Button>
                        )}
                        {["SUCCESS", "ERROR"].includes(workflowDetail?.status || "") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-purple-500/50 text-purple-600 hover:bg-purple-50"
                            onClick={() => openDrawer("fork")}
                          >
                            <GitFork className="h-3 w-3 mr-1" />
                            Fork
                          </Button>
                        )}
                      </div>
                    </section>

                    <section className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                          Name
                        </p>
                        <p className="font-medium">{workflowDetail?.workflowName}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                          Class
                        </p>
                        <p className="font-medium">{workflowDetail?.workflowClassName}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                          Queue
                        </p>
                        <p className="font-medium">{workflowDetail?.queueName ?? "-"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                          Version
                        </p>
                        <p className="font-medium">{workflowDetail?.applicationVersion ?? "-"}</p>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                        <Shield className="h-3 w-3" />
                        Audit Feed
                      </h3>
                      <div className="space-y-3">
                        {audit.map((row, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded border bg-background text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="uppercase text-[10px] h-4">
                                {row.op}
                              </Badge>
                              <span className="text-muted-foreground text-[10px]">
                                {toIso(parseIso(row.at))}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-muted-foreground text-[9px] uppercase">Actor</p>
                                <p className="font-medium">{row.actor}</p>
                              </div>
                              {row.forkedWorkflowID && (
                                <div>
                                  <p className="text-muted-foreground text-[9px] uppercase">
                                    Forked WID
                                  </p>
                                  <p className="font-mono text-[10px] truncate">
                                    {row.forkedWorkflowID}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-muted-foreground text-[9px] uppercase">Reason</p>
                              <p className="italic text-muted-foreground">"{row.reason}"</p>
                            </div>
                          </div>
                        ))}
                        {audit.length === 0 && (
                          <p className="text-xs italic text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                            No operator actions recorded
                          </p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3">
                        Steps
                      </h3>
                      <div className="space-y-2">
                        {steps.map((step) => (
                          <div
                            key={`${step.stepId}-${step.functionId}`}
                            className="p-2 rounded border bg-background text-xs flex items-center justify-between"
                          >
                            <div className="flex flex-col">
                              <span className="font-mono font-bold">{step.stepId}</span>
                              <span className="text-muted-foreground">
                                Func ID: {step.functionId}
                              </span>
                            </div>
                            <Badge
                              variant={
                                step.status === "SUCCESS"
                                  ? "outline"
                                  : step.status === "ERROR"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {step.status}
                            </Badge>
                          </div>
                        ))}
                        {steps.length === 0 && (
                          <p className="text-xs italic text-muted-foreground text-center py-4">
                            No steps recorded
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="queues" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] font-mono h-5">
                    sysdb app.v_ops_queue_depth
                  </Badge>
                  <span className="text-[10px] text-muted-foreground italic">
                    Live system-DB oracle view
                  </span>
                </div>
              </div>

              {loadingQueue ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {queueDepth.map((q) => (
                    <Card key={`${q.queueName}-${q.status}`}>
                      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-mono">{q.queueName}</CardTitle>
                        <Badge variant="outline">{q.status}</Badge>
                      </CardHeader>
                      <CardContent className="py-3 px-4">
                        <div className="text-2xl font-bold">{q.workflowCount}</div>
                        <p className="text-xs text-muted-foreground">Workflows</p>
                        {q.oldestCreatedAt && (
                          <p className="text-[10px] text-muted-foreground mt-2">
                            Oldest: {toIso(q.oldestCreatedAt)}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {queueDepth.length === 0 && (
                    <div className="col-span-full text-center p-8 text-muted-foreground italic border rounded-lg border-dashed">
                      No active queues reported by sysdb app.v_ops_queue_depth
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {selectedWid && (
        <OpsActionDrawer
          wid={selectedWid}
          action={drawerAction}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onSuccess={() => {
            fetchWorkflows();
            fetchDetail(selectedWid);
          }}
          defaultStepN={maxStepN || 1}
        />
      )}
    </div>
  );
}
