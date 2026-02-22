import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getGateService } from "@src/server/ui-api";
import { assertGateGetQuery } from "@src/contracts/hitl/gate-get-query.schema";
import { toOpsErrorResponse } from "../../../../ops/wf/route-utils";

type Props = {
  params: Promise<{ wid: string; gateKey: string }>;
};

export async function GET(req: Request, { params }: Props) {
  try {
    const { pool, workflow } = await getServices();
    const { wid, gateKey } = await params;

    const { searchParams } = new URL(req.url);
    const timeoutRaw = searchParams.get("timeoutS");
    const query = {
      timeoutS: timeoutRaw === null ? undefined : Number(timeoutRaw)
    };
    assertGateGetQuery(query);
    const timeoutS = query.timeoutS ?? 0.1;

    const gate = await getGateService(pool, workflow, wid, gateKey, timeoutS);
    if (!gate) {
      return NextResponse.json({ error: "gate not found" }, { status: 404 });
    }
    return NextResponse.json(gate, { status: 200 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, `GET /api/runs/:wid/gates/:gateKey`);
  }
}
