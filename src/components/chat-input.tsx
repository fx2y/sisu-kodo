"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@src/components/ui/button";
import { Textarea } from "@src/components/ui/textarea";
import { Loader2, Play } from "lucide-react";

export function ChatInput({ initialWid: _initialWid }: { initialWid?: string }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRun = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    try {
      // 1. Create Intent
      const intentRes = await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: input,
          inputs: {},
          constraints: {}
        })
      });

      if (!intentRes.ok) throw new Error("Failed to create intent");
      const { intentId } = await intentRes.json();

      // 2. Start Run
      const runRes = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId,
          recipeName: "compile-default"
          // We can add default workload or other params here
        })
      });

      if (!runRes.ok) throw new Error("Failed to start run");
      const { workflowID } = await runRes.json();

      // 3. Navigate to the new workflow
      router.push(`/?wid=${workflowID}`);
      setInput("");
    } catch (error) {
      console.error("Run error:", error);
      // We could add a toast here
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Describe your goal..."
        className="min-h-[100px] pr-20 resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleRun();
          }
        }}
      />
      <div className="absolute right-2 bottom-2">
        <Button size="sm" onClick={handleRun} disabled={loading || !input.trim()} className="gap-2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
          Run
        </Button>
      </div>
    </div>
  );
}
