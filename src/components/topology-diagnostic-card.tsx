import { AlertTriangle, Server, ZapOff } from "lucide-react";
import { Badge } from "@src/components/ui/badge";
import { RunHeader } from "@src/contracts/ui/run-header.schema";

export function TopologyDiagnosticCard({
  header,
  stepsCount
}: {
  header: RunHeader;
  stepsCount: number;
}) {
  const isEnqueuedStalled = header.status === "ENQUEUED" && stepsCount === 0;
  const versionMismatch = header.workflowVersion && header.appVersion && header.workflowVersion !== header.appVersion;
  const isShimMode = header.topology === "api-shim";

  if (!isEnqueuedStalled && !versionMismatch) return null;

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-yellow-600">
        <AlertTriangle className="h-5 w-5" />
        <h3 className="font-semibold text-sm">Topology Diagnostic</h3>
      </div>

      <div className="space-y-2">
        {isEnqueuedStalled && (
          <div className="flex gap-3">
            <ZapOff className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">Workflow Stalled in Queue</p>
              <p className="text-muted-foreground">
                Run is enqueued but no worker has picked it up.
                {isShimMode ? " Ensure an inproc-worker is running with shared DB." : " Check worker concurrency and queue health."}
              </p>
            </div>
          </div>
        )}

        {versionMismatch && (
          <div className="flex gap-3">
            <Server className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">Version Mismatch Detected</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] h-4">API: {header.appVersion}</Badge>
                <span className="text-muted-foreground">vs</span>
                <Badge variant="outline" className="text-[10px] h-4">Worker: {header.workflowVersion}</Badge>
              </div>
              <p className="text-muted-foreground">
                Shared DBOS__APPVERSION is mandatory for split topology parity.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-yellow-500/10">
        <p className="text-[10px] uppercase font-bold text-yellow-700 tracking-wider">Suggested Remediation:</p>
        <ul className="list-disc list-inside text-[10px] text-muted-foreground mt-1 space-y-0.5">
          {isShimMode && <li>Start worker: <code className="bg-yellow-500/10 px-1 rounded">WORKFLOW_RUNTIME_MODE=inproc-worker npm start</code></li>}
          <li>Verify <code className="bg-yellow-500/10 px-1 rounded">DBOS__APPVERSION</code> matches in both processes.</li>
          <li>Check <code className="bg-yellow-500/10 px-1 rounded">/api/ops/queue-depth</code> for backlog aging.</li>
        </ul>
      </div>
    </div>
  );
}
