import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getStepRowsService } from "@src/server/ui-api";
import { findRunByIdOrWorkflowId } from "@src/db/runRepo";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  try {
    const { pool, workflow } = await getServices();
    const { wid } = await params;

    // Check if run exists (fixes G09)
    const run = await findRunByIdOrWorkflowId(pool, wid);
    if (!run) {
      return NextResponse.json({ error: "run not found" }, { status: 404 });
    }

    const steps = await getStepRowsService(pool, workflow, wid);
    return NextResponse.json(steps, { status: 200 });
  } catch (error: unknown) {
    console.error(`[API] GET /api/runs/:wid/steps error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
