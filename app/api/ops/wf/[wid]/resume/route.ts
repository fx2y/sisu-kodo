import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import {
  assertResumeWorkflowParams,
  assertResumeWorkflowRequest,
  assertResumeWorkflowResponse
} from "@src/contracts/ops/resume.schema";
import { resumeWorkflow } from "@src/server/ops-api";
import { readJsonBody, toOpsErrorResponse } from "../../route-utils";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function POST(req: Request, { params }: Props) {
  try {
    const { workflow } = await getServices();
    const body = await readJsonBody(req);
    assertResumeWorkflowRequest(body);
    const { wid } = await params;
    const payload = { id: wid };
    assertResumeWorkflowParams(payload);
    const out = await resumeWorkflow(workflow, payload.id);
    assertResumeWorkflowResponse(out);
    return NextResponse.json(out, { status: 202 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, "POST /api/ops/wf/:wid/resume");
  }
}
