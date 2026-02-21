import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { postReplyService } from "@src/server/ui-api";
import { readJsonBody, toOpsErrorResponse } from "../../../../../ops/wf/route-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wid: string; gateKey: string }> }
) {
  try {
    const { pool, workflow } = await getServices();
    const { wid, gateKey } = await params;
    const body = await readJsonBody(request);
    await postReplyService(pool, workflow, wid, gateKey, body);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, `POST /api/runs/:wid/gates/:gateKey/reply`);
  }
}
