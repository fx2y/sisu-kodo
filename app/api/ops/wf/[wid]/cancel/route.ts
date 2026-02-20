import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import {
  assertCancelWorkflowParams,
  assertCancelWorkflowRequest,
  assertCancelWorkflowResponse
} from "@src/contracts/ops/cancel.schema";
import { cancelWorkflow } from "@src/server/ops-api";
import { readJsonBody, toOpsErrorResponse } from "../../route-utils";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function POST(req: Request, { params }: Props) {
  try {
    const { workflow, pool } = await getServices();
    const body = await readJsonBody(req);
    assertCancelWorkflowRequest(body);
    const { wid } = await params;
    const payload = { id: wid };
    assertCancelWorkflowParams(payload);
    const out = await cancelWorkflow(workflow, payload.id, pool, body.actor, body.reason);
    assertCancelWorkflowResponse(out);
    return NextResponse.json(out, { status: 202 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, "POST /api/ops/wf/:wid/cancel");
  }
}
