"use client";

import { Input } from "@src/components/ui/input";
import { Label } from "@src/components/ui/label";
import type { RunBudget } from "@src/contracts/run-request.schema";

interface BudgetEditorProps {
  budget: RunBudget;
  onChange: (budget: RunBudget) => void;
}

export function BudgetEditor({ budget, onChange }: BudgetEditorProps) {
  const handleChange = (field: keyof RunBudget, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      onChange({ ...budget, [field]: num });
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-background/50 text-xs">
      <div className="space-y-1.5">
        <Label htmlFor="maxFanout" className="text-[10px] uppercase text-muted-foreground font-bold">
          Max Fanout
        </Label>
        <Input
          id="maxFanout"
          type="number"
          min={1}
          value={budget.maxFanout}
          onChange={(e) => handleChange("maxFanout", e.target.value)}
          className="h-8 text-xs"
        />
        <p className="text-[9px] text-muted-foreground italic">Parallel tasks limit</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="maxSBXMinutes" className="text-[10px] uppercase text-muted-foreground font-bold">
          Max SBX Minutes
        </Label>
        <Input
          id="maxSBXMinutes"
          type="number"
          min={1}
          value={budget.maxSBXMinutes}
          onChange={(e) => handleChange("maxSBXMinutes", e.target.value)}
          className="h-8 text-xs"
        />
        <p className="text-[9px] text-muted-foreground italic">Sandbox duration cap</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="maxArtifactsMB" className="text-[10px] uppercase text-muted-foreground font-bold">
          Max Artifacts MB
        </Label>
        <Input
          id="maxArtifactsMB"
          type="number"
          min={1}
          value={budget.maxArtifactsMB}
          onChange={(e) => handleChange("maxArtifactsMB", e.target.value)}
          className="h-8 text-xs"
        />
        <p className="text-[9px] text-muted-foreground italic">Total output size limit</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="maxRetriesPerStep" className="text-[10px] uppercase text-muted-foreground font-bold">
          Max Retries/Step
        </Label>
        <Input
          id="maxRetriesPerStep"
          type="number"
          min={0}
          value={budget.maxRetriesPerStep}
          onChange={(e) => handleChange("maxRetriesPerStep", e.target.value)}
          className="h-8 text-xs"
        />
        <p className="text-[9px] text-muted-foreground italic">Retry attempts allowed</p>
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label htmlFor="maxWallClockMS" className="text-[10px] uppercase text-muted-foreground font-bold">
          Max Wall Clock (MS)
        </Label>
        <Input
          id="maxWallClockMS"
          type="number"
          min={1}
          value={budget.maxWallClockMS}
          onChange={(e) => handleChange("maxWallClockMS", e.target.value)}
          className="h-8 text-xs"
        />
        <p className="text-[9px] text-muted-foreground italic">Total workflow execution time limit</p>
      </div>
    </div>
  );
}
