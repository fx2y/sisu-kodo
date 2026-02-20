import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { assertWorkflowIdParam, assertGetWorkflowResponse } from "@src/contracts/ops/get.schema";
import { getWorkflow } from "@src/server/ops-api";
import { toOpsErrorResponse } from "../route-utils";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  try {
    const { workflow } = await getServices();
    const { wid } = await params;
    const payload = { id: wid };
    assertWorkflowIdParam(payload);
    const out = await getWorkflow(workflow, payload.id);
    assertGetWorkflowResponse(out);
    return NextResponse.json(out, { status: 200 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, "GET /api/ops/wf/:wid");
  }
}
