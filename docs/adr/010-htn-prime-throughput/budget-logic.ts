/**
 * Ultra-dense budget guard logic.
 * No IO. Deterministic.
 */
export function checkBudget(
  observed: { steps: number; artifactsMB: number; elapsedMs: number },
  limit: RunBudget
): BudgetOutcome {
  if (observed.steps > limit.maxFanout) 
    return { k: 'maxFanout', limit: limit.maxFanout, observed: observed.steps, outcome: 'blocked' };
    
  if (observed.elapsedMs > limit.maxWallClockMs)
    return { k: 'maxWallClock', limit: limit.maxWallClockMs, observed: observed.elapsedMs, outcome: 'blocked' };

  return { outcome: 'pass' };
}
