import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getGatesService } from "@src/server/ui-api";
import { toOpsErrorResponse } from "../../../ops/wf/route-utils";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ wid: string }> }) {
  try {
    const { pool, workflow } = await getServices();
    const { wid } = await params;
    const gates = await getGatesService(pool, workflow, wid);
    return NextResponse.json(gates);
  } catch (error: unknown) {
    return toOpsErrorResponse(error, `GET /api/runs/:wid/gates`);
  }
}
