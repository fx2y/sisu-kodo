import type { SessionStats } from "./session-store";

export class SessionRotationPolicy {
  constructor(
    private readonly messageBudget: number = 20,
    private readonly tokenBudget: number = 100000
  ) {}

  shouldRotate(stats: SessionStats): boolean {
    return stats.messageCount >= this.messageBudget || stats.tokenCount >= this.tokenBudget;
  }
}
