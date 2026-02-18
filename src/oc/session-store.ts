export class SessionStore {
  private readonly sessions = new Map<string, string>();

  set(runId: string, sessionId: string): void {
    if (this.sessions.has(runId) && this.sessions.get(runId) !== sessionId) {
      throw new Error(`session-conflict: run ${runId} already has session ${this.sessions.get(runId)}`);
    }
    this.sessions.set(runId, sessionId);
  }

  get(runId: string): string | undefined {
    return this.sessions.get(runId);
  }

  clear(runId: string): void {
    this.sessions.delete(runId);
  }
}
