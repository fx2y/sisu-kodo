import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { startRunFromRecipeService } from "@src/server/ui-api";
import { parseJsonBody } from "@src/server/json-body";
import { toRunStartErrorResponse } from "../runs/route-utils";

export async function POST(req: Request) {
  try {
    const { pool, workflow } = await getServices();
    const payload = parseJsonBody(await req.text());
    const { header, isReplay } = await startRunFromRecipeService(pool, workflow, payload);
    return NextResponse.json({ ...header, isReplay }, { status: isReplay ? 200 : 201 });
  } catch (error: unknown) {
    return toRunStartErrorResponse(error, "POST /api/run");
  }
}
