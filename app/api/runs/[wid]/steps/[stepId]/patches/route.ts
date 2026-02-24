import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getPatchHistoryService } from "@src/server/ui-api";
import { findRunByIdOrWorkflowId } from "@src/db/runRepo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wid: string; stepId: string }> }
) {
  try {
    const { wid, stepId } = await params;
    const { pool } = await getServices();
    const run = await findRunByIdOrWorkflowId(pool, wid);
    if (!run) {
      return NextResponse.json({ error: "run not found" }, { status: 404 });
    }
    const history = await getPatchHistoryService(pool, run.id, stepId);
    return NextResponse.json(history);
  } catch (error: unknown) {
    console.error(`[API] GET /api/runs/[wid]/steps/[stepId]/patches error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
