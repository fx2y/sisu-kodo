import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getHitlInteractionsService } from "@src/server/ui-api";
import { assertHitlInteractionsQuery } from "@src/contracts/hitl/interactions-query.schema";
import { toOpsErrorResponse } from "../../../ops/wf/route-utils";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function GET(req: Request, { params }: Props) {
  try {
    const { pool } = await getServices();
    const { wid } = await params;
    const { searchParams } = new URL(req.url);
    const query = {
      limit: searchParams.get("limit") === null ? undefined : Number(searchParams.get("limit"))
    };
    assertHitlInteractionsQuery(query);
    const rows = await getHitlInteractionsService(pool, wid, query.limit ?? 200);
    return NextResponse.json(rows, { status: 200 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, "GET /api/runs/:wid/interactions");
  }
}
