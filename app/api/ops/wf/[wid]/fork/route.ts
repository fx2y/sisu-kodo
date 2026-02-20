import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import {
  assertForkWorkflowParams,
  assertForkWorkflowRequest,
  assertForkWorkflowResponse
} from "@src/contracts/ops/fork.schema";
import { forkWorkflow } from "@src/server/ops-api";
import { readJsonBody, toOpsErrorResponse } from "../../route-utils";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function POST(req: Request, { params }: Props) {
  try {
    const { workflow, pool } = await getServices();
    const body = await readJsonBody(req);
    assertForkWorkflowRequest(body);
    const { wid } = await params;
    const payload = { id: wid };
    assertForkWorkflowParams(payload);
    const out = await forkWorkflow(workflow, payload.id, body, pool, body.actor, body.reason);
    assertForkWorkflowResponse(out);
    return NextResponse.json(out, { status: 202 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, "POST /api/ops/wf/:wid/fork");
  }
}
