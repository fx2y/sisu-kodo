import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import {
  assertSleepWorkflowRequest,
  assertSleepWorkflowResponse
} from "@src/contracts/ops/sleep.schema";
import { startSleepWorkflow } from "@src/server/ops-api";
import { toOpsErrorResponse } from "../wf/route-utils";

export async function POST(req: Request) {
  try {
    const { workflow, pool } = await getServices();
    const { searchParams } = new URL(req.url);
    const request = {
      workflowID: searchParams.get("wf") ?? "",
      sleepMs: Number(searchParams.get("sleep") ?? "5000")
    };
    assertSleepWorkflowRequest(request);
    const out = await startSleepWorkflow(workflow, pool, request.workflowID, request.sleepMs);
    assertSleepWorkflowResponse(out);
    return NextResponse.json(out, { status: 202 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, "POST /api/ops/sleep");
  }
}
