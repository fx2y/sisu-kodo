"use client";

import { useState } from "react";
import { Button } from "@src/components/ui/button";
import { Input } from "@src/components/ui/input";
import { Textarea } from "@src/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from "@src/components/ui/sheet";
import { Loader2 } from "lucide-react";

type OpsAction = "cancel" | "resume" | "fork";

interface OpsActionDrawerProps {
  wid: string;
  action: OpsAction | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultStepN?: number;
}

export function OpsActionDrawer({
  wid,
  action,
  isOpen,
  onClose,
  onSuccess,
  defaultStepN = 1
}: OpsActionDrawerProps) {
  const [actor, setActor] = useState("ui-operator");
  const [reason, setReason] = useState("");
  const [stepN, setStepN] = useState(defaultStepN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }
    setError(null);
    setBusy(true);

    try {
      const body: Record<string, unknown> = { actor, reason };
      if (action === "fork") {
        body.stepN = stepN;
      }

      const res = await fetch(`/api/ops/wf/${wid}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || res.statusText);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="uppercase">Execute {action}</SheetTitle>
          <SheetDescription>
            Target Workflow: <span className="font-mono text-xs">{wid}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <label htmlFor="actor" className="text-sm font-medium">
              Actor
            </label>
            <Input
              id="actor"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="Your name or ID"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reason" className="text-sm font-medium">
              Reason
            </label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this action needed?"
              className="min-h-[100px]"
            />
          </div>

          {action === "fork" && (
            <div className="space-y-2">
              <label htmlFor="stepN" className="text-sm font-medium">
                Fork from Step N
              </label>
              <Input
                id="stepN"
                type="number"
                min={1}
                value={stepN}
                onChange={(e) => setStepN(parseInt(e.target.value, 10) || 1)}
              />
              <p className="text-[10px] text-muted-foreground">
                Execution will resume from this step in a new workflow.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-destructive/10 text-destructive text-sm border border-destructive/20">
              {error}
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={busy}
            variant={action === "cancel" ? "destructive" : "default"}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm {action}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
