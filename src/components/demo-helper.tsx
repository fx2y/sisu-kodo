"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@src/components/ui/card";
import { Badge } from "@src/components/ui/badge";
import { Button } from "@src/components/ui/button";
import { ChevronRight, PlayCircle } from "lucide-react";
import { cn } from "@src/lib/utils";

const DEMO_STEPS = [
  {
    id: "S00",
    label: "Preflight & IA",
    board: "run",
    description: "Establish baseline control plane."
  },
  { id: "S01", label: "Run Console", board: "run", description: "Start workflow via /api/run." },
  {
    id: "S04",
    label: "HITL Origin",
    board: "run",
    tab: "gate",
    description: "Reply with explicit origin & dedupe."
  },
  {
    id: "S02",
    label: "HITL Inbox",
    board: "hitl-inbox",
    description: "Cross-run pending gate management."
  },
  { id: "S07", label: "Ops Console", board: "ops", description: "Guarded mutation & fork/repair." },
  {
    id: "S08",
    label: "Proof & Repro",
    board: "run",
    tab: "proof",
    description: "Oracle evidence & repro-pack export."
  },
  {
    id: "S10",
    label: "Throughput",
    board: "throughput",
    description: "Fairness, budget & k6 trends."
  },
  {
    id: "S12",
    label: "Recipe Registry",
    board: "recipe",
    description: "Versioned launch & pinned refs."
  },
  { id: "S15", label: "Signoff Board", board: "signoff", description: "Binary release governance." }
];

export function DemoHelper() {
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  const nextStep = () => {
    setCurrentStepIdx((prev) => Math.min(prev + 1, DEMO_STEPS.length - 1));
  };

  const prevStep = () => {
    setCurrentStepIdx((prev) => Math.max(prev - 1, 0));
  };

  const currentStep = DEMO_STEPS[currentStepIdx];

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-inner">
      <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <PlayCircle className="text-primary" size={18} />
          <CardTitle className="text-sm font-black uppercase tracking-widest">
            Sales Demo Sequence
          </CardTitle>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          {currentStepIdx + 1} / {DEMO_STEPS.length}
        </Badge>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{currentStep.id}</span>
              <span className="text-sm font-medium">{currentStep.label}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {currentStep.description}
            </p>
          </div>
          <div className="shrink-0 flex flex-col gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs font-bold uppercase tracking-tight"
              asChild
            >
              <a
                href={`/?board=${currentStep.board}${currentStep.tab ? `&tab=${currentStep.tab}` : ""}`}
              >
                Go to Board
              </a>
            </Button>
          </div>
        </div>

        <div className="flex gap-1 justify-center">
          {DEMO_STEPS.map((step, idx) => (
            <div
              key={step.id}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all",
                idx === currentStepIdx
                  ? "bg-primary w-4"
                  : idx < currentStepIdx
                    ? "bg-primary/40"
                    : "bg-muted"
              )}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-[10px] uppercase font-bold"
            onClick={prevStep}
            disabled={currentStepIdx === 0}
          >
            Previous
          </Button>
          <Button
            variant="default"
            size="sm"
            className="flex-1 h-8 text-[10px] uppercase font-bold bg-primary text-primary-foreground"
            onClick={nextStep}
            disabled={currentStepIdx === DEMO_STEPS.length - 1}
          >
            Next Step
            <ChevronRight size={12} className="ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
