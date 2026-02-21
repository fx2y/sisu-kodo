import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getGateService } from "@src/server/ui-api";
import { toOpsErrorResponse } from "../../../../ops/wf/route-utils";

type Props = {
  params: Promise<{ wid: string; gateKey: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  try {
    const { pool, workflow } = await getServices();
    const { wid, gateKey } = await params;

    const gate = await getGateService(pool, workflow, wid, gateKey);
    if (!gate) {
      return NextResponse.json({ error: "gate not found" }, { status: 404 });
    }
    return NextResponse.json(gate, { status: 200 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, `GET /api/runs/:wid/gates/:gateKey`);
  }
}
