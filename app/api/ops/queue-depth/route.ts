import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import {
  assertQueueDepthQuery,
  assertQueueDepthResponse
} from "@src/contracts/ops/queue-depth.schema";
import { listQueueDepth } from "@src/server/ops-api";
import { parseQueueDepthQuery, toOpsErrorResponse } from "../wf/route-utils";

export async function GET(req: Request) {
  try {
    const { sysPool } = await getServices();
    const query = parseQueueDepthQuery(req.url);
    assertQueueDepthQuery(query);
    const out = await listQueueDepth(sysPool, query);
    assertQueueDepthResponse(out);
    return NextResponse.json(out, { status: 200 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, "GET /api/ops/queue-depth");
  }
}
