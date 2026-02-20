import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { findRunByIdOrWorkflowId } from "@src/db/runRepo";
import { assertPlanApprovalRequest } from "@src/contracts/plan-approval.schema";
import { approvePlan } from "@src/db/planApprovalRepo";
import { ValidationError } from "@src/contracts/assert";

import { findLatestGateByRunId } from "@src/db/humanGateRepo";
import { toHumanTopic } from "@src/lib/hitl-topic";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function POST(req: Request, { params }: Props) {
  try {
    const { pool, workflow } = await getServices();
    const { wid } = await params;

    const run = await findRunByIdOrWorkflowId(pool, wid);
    if (!run) {
      return NextResponse.json({ error: "run not found" }, { status: 404 });
    }

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    assertPlanApprovalRequest(payload);

    const approvedAt = await approvePlan(pool, run.id, payload.approvedBy, payload.notes);

    // C1.T2 Compatibility: Map to new per-gate topic
    if (run.status === "waiting_input") {
      const latestGate = await findLatestGateByRunId(pool, run.id);
      const topic = latestGate ? latestGate.topic : toHumanTopic("legacy-event");
      const dedupeKey = `legacy-approve-${run.id}-${Date.now()}`;

      await workflow.sendMessage(run.workflow_id, { approved: true, ...payload }, topic, dedupeKey);
    }

    return NextResponse.json(
      {
        accepted: true,
        runId: run.id,
        approvedAt: approvedAt.toISOString()
      },
      { status: 202 }
    );
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, details: error.errors }, { status: 400 });
    }
    console.error(`[API] POST /api/runs/:wid/approve-plan error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
