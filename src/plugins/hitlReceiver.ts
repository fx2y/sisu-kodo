import { DBOS } from "@dbos-inc/dbos-sdk";
import { DBOSWorkflowEngine } from "../workflow/engine-dbos";

/**
 * HITLReceiverPlugin
 * Seam for external pollers (e.g. CI, PR status, external tasks).
 * Uses DBOS scheduled workflows for durable, exactly-once polling.
 */
@DBOS.className("HITLReceiverPlugin")
export class HITLReceiverPlugin {
  private static _engine?: DBOSWorkflowEngine;

  private static get engine(): DBOSWorkflowEngine {
    if (!this._engine) {
      this._engine = new DBOSWorkflowEngine(20);
    }
    return this._engine;
  }

  /**
   * Example: Poll external CI status.
   * In a real implementation, this would query CI APIs and then emit signals.
   */
  @DBOS.scheduled({ crontab: "*/5 * * * * *" }) // Every 5 seconds for demonstration
  @DBOS.workflow()
  static async pollExternalSignals(_scheduledAt: Date, _triggeredAt: Date) {
    // This is a placeholder for external polling logic.
    // When a signal is found, it routes to the unified postExternalEventService.
    // Example (commented out):
    /*
    const signals = await MyCIApi.getActiveSignals();
    for (const s of signals) {
      await postExternalEventService(getPool(), this.engine, {
        workflowId: s.wid,
        gateKey: s.gateKey,
        topic: s.topic,
        payload: { approved: s.success },
        dedupeKey: `poller-${s.runId}-${s.at}`,
        origin: "poller-ci"
      });
    }
    */
  }
}
