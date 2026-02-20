import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { findRunByIdOrWorkflowId } from "@src/db/runRepo";
import { assertPlanApprovalRequest } from "@src/contracts/plan-approval.schema";
import { approvePlan } from "@src/db/planApprovalRepo";
import { ValidationError } from "@src/contracts/assert";

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

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    assertPlanApprovalRequest(payload);

    const approvedAt = await approvePlan(pool, run.id, payload.approvedBy, payload.notes);

    // If it's in waiting_input, we need to signal the workflow
    if (run.status === "waiting_input") {
      await workflow.sendEvent(run.workflow_id, {
        type: "approve-plan",
        payload: { approvedBy: payload.approvedBy }
      });
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
