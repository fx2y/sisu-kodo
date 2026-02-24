"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, ShieldCheck } from "lucide-react";
import type { GateView } from "@src/contracts/ui/gate-view.schema";
import { formatRelative, formatTime } from "@src/lib/time";
import { cn } from "@src/lib/utils";
import { Badge } from "@src/components/ui/badge";
import { Button } from "@src/components/ui/button";
import { Input } from "@src/components/ui/input";
import type { GateReply } from "@src/contracts/hitl/gate-reply.schema";

type GateField =
  | { k: string; t: "str"; opt?: boolean }
  | { k: string; t: "enum"; opt?: boolean; vs: string[] };

type GateFormSchema = {
  title: string;
  fields: GateField[];
};

const ORIGINS: GateReply["origin"][] = [
  "manual",
  "api-shim",
  "webhook",
  "webhook-ci",
  "external",
  "unknown"
];

function parseGateFormSchema(value: unknown): GateFormSchema | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const title = typeof raw.title === "string" && raw.title.length > 0 ? raw.title : "Approval";
  if (!Array.isArray(raw.fields)) return null;
  const fields: GateField[] = [];
  for (const entry of raw.fields) {
    if (typeof entry !== "object" || entry === null) return null;
    const field = entry as Record<string, unknown>;
    const k = typeof field.k === "string" ? field.k : "";
    if (!k) return null;
    if (field.t === "str") {
      fields.push({ k, t: "str", opt: field.opt === true });
      continue;
    }
    if (field.t === "enum" && Array.isArray(field.vs)) {
      const vs = field.vs.filter((v): v is string => typeof v === "string" && v.length > 0);
      if (vs.length === 0) return null;
      fields.push({ k, t: "enum", opt: field.opt === true, vs });
      continue;
    }
    return null;
  }
  return { title, fields };
}

function buildDefaultDedupeKey(workflowID: string, gateKey: string, createdAt: number): string {
  return `ui:${workflowID}:${gateKey}:${createdAt}`;
}

export function HitlGateCard({
  wid,
  gate,
  onResolved
}: {
  wid: string;
  gate: GateView;
  onResolved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [replyPayload, setReplyPayload] = useState<Record<string, unknown>>({});
  const [origin, setOrigin] = useState<GateReply["origin"]>("manual");
  const [error, setError] = useState<string | null>(null);
  const [isReplay, setIsReplay] = useState(false);
  const formSchema = parseGateFormSchema(gate.prompt.formSchema);
  const dedupePreview = useMemo(
    () => buildDefaultDedupeKey(wid, gate.gateKey, gate.prompt.createdAt),
    [wid, gate.gateKey, gate.prompt.createdAt]
  );
  const [dedupeKey, setDedupeKey] = useState(dedupePreview);

  const isPending = gate.state === "PENDING";
  const isResolved = gate.state === "RESOLVED" || gate.state === "RECEIVED";
  const isTimedOut = gate.state === "TIMED_OUT";
  const closedReason = isPending ? null : "gate_closed";

  const handleReply = async () => {
    setLoading(true);
    setError(null);
    setIsReplay(false);
    try {
      const res = await fetch(`/api/runs/${wid}/gates/${gate.gateKey}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: replyPayload,
          dedupeKey,
          origin
        } satisfies GateReply)
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; isReplay?: boolean };
      if (!res.ok) {
        setError(body.error ?? `reply_failed:${res.status}`);
        return;
      }
      setIsReplay(body.isReplay === true);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "reply_failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border p-4",
        isPending ? "border-yellow-500/20 bg-yellow-500/5" : "border-muted bg-muted/10 opacity-80"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              isPending ? "bg-yellow-500/10 text-yellow-600" : "bg-muted text-muted-foreground"
            )}
          >
            {isResolved ? (
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            ) : isTimedOut ? (
              <Clock className="h-6 w-6 text-destructive" />
            ) : (
              <ShieldCheck className="h-6 w-6" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">
              {formSchema?.title ?? `Gate: ${gate.gateKey}`}
            </span>
            <span className="text-xs opacity-70">
              {isPending
                ? `Expires ${formatRelative(gate.deadlineAt)} (${formatTime(gate.deadlineAt)})`
                : isResolved
                  ? `Resolved ${formatRelative(gate.result?.at || gate.createdAt)} (${formatTime(gate.result?.at || gate.createdAt)})`
                  : `Timed out ${formatRelative(gate.deadlineAt)} (${formatTime(gate.deadlineAt)})`}
            </span>
          </div>
        </div>
        <Badge variant={isPending ? "outline" : "secondary"}>{gate.state}</Badge>
      </div>

      {isPending && (
        <div className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor={`origin-${gate.gateKey}`}
                className="text-[10px] font-bold uppercase text-muted-foreground"
              >
                origin
              </label>
              <select
                id={`origin-${gate.gateKey}`}
                className="w-full rounded border bg-background px-2 py-1 text-xs"
                value={origin}
                onChange={(e) => setOrigin(e.target.value as GateReply["origin"])}
              >
                {ORIGINS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                htmlFor={`dedupe-${gate.gateKey}`}
                className="text-[10px] font-bold uppercase text-muted-foreground"
              >
                dedupe key
              </label>
              <Input
                id={`dedupe-${gate.gateKey}`}
                value={dedupeKey}
                onChange={(e) => setDedupeKey(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">preview: {dedupePreview}</div>

          {formSchema ? (
            <div className="grid gap-3">
              {formSchema.fields.map((f) => (
                <div key={f.k} className="space-y-1.5">
                  <label
                    htmlFor={`field-${gate.gateKey}-${f.k}`}
                    className="text-[10px] font-bold uppercase text-muted-foreground"
                  >
                    {f.k} {f.opt ? "(optional)" : ""}
                  </label>
                  {f.t === "enum" ? (
                    <div
                      className="flex flex-wrap gap-2"
                      id={`field-${gate.gateKey}-${f.k}`}
                      role="group"
                      aria-label={f.k}
                    >
                      {f.vs.map((v) => (
                        <Button
                          key={v}
                          variant={replyPayload[f.k] === v ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setReplyPayload((p) => ({ ...p, [f.k]: v }))}
                          aria-pressed={replyPayload[f.k] === v}
                        >
                          {v}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Input
                      id={`field-${gate.gateKey}-${f.k}`}
                      className="h-8 text-xs"
                      placeholder={`Enter ${f.k}...`}
                      value={(replyPayload[f.k] as string) || ""}
                      onChange={(e) => setReplyPayload((p) => ({ ...p, [f.k]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Invalid gate form schema. Refresh to reload.
            </div>
          )}
          <Button
            onClick={handleReply}
            disabled={loading || !formSchema || dedupeKey.trim().length === 0}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white shadow-sm h-9"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Submit Response
          </Button>
        </div>
      )}

      {!isPending && (
        <div className="text-xs text-muted-foreground">
          submit disabled: <span className="font-mono">{closedReason}</span>
        </div>
      )}

      {isReplay && (
        <Badge variant="outline" className="w-fit border-green-500/40 text-green-600">
          idempotent replay
        </Badge>
      )}

      {error && (
        <div className="rounded border border-destructive/40 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {gate.result?.payload && (
        <pre className="rounded bg-black/5 p-2 text-[10px] dark:bg-white/5">
          {JSON.stringify(gate.result.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
