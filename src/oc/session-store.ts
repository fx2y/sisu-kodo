export type SessionStats = {
  sessionId: string;
  messageCount: number;
  tokenCount: number;
};

export class SessionStore {
  private readonly sessions = new Map<string, SessionStats>();

  set(runId: string, sessionId: string): void {
    if (this.sessions.has(runId)) {
      const existing = this.sessions.get(runId)!;
      if (existing.sessionId !== sessionId) {
        throw new Error(`session-conflict: run ${runId} already has session ${existing.sessionId}`);
      }
      return;
    }
    this.sessions.set(runId, { sessionId, messageCount: 0, tokenCount: 0 });
  }

  get(runId: string): string | undefined {
    return this.sessions.get(runId)?.sessionId;
  }

  getStats(runId: string): SessionStats | undefined {
    return this.sessions.get(runId);
  }

  incrementStats(runId: string, messages: number, tokens: number): void {
    const stats = this.sessions.get(runId);
    if (stats) {
      stats.messageCount += messages;
      stats.tokenCount += tokens;
    }
  }

  clear(runId: string): void {
    this.sessions.delete(runId);
  }
}
