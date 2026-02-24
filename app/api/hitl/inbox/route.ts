import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getHitlInboxService } from "@src/server/ui-api";
import { assertHitlInboxQuery } from "@src/contracts/hitl/inbox-query.schema";
import { toOpsErrorResponse } from "../../ops/wf/route-utils";

export async function GET(req: Request) {
  try {
    const { pool, workflow } = await getServices();
    const { searchParams } = new URL(req.url);
    const query = {
      limit: searchParams.get("limit") === null ? undefined : Number(searchParams.get("limit"))
    };
    assertHitlInboxQuery(query);
    const rows = await getHitlInboxService(pool, workflow, query.limit ?? 100);
    return NextResponse.json(rows, { status: 200 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, "GET /api/hitl/inbox");
  }
}
