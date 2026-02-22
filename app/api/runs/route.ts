import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { startRunService } from "@src/server/ui-api";
import { parseLegacyRunStartPayload } from "@src/intent-compiler/run-start";
import { parseJsonBody } from "@src/server/json-body";
import { toRunStartErrorResponse } from "./route-utils";

export async function POST(req: Request) {
  try {
    const { pool, workflow } = await getServices();
    const payload = parseJsonBody(await req.text());
    const { intentId, runRequest } = parseLegacyRunStartPayload(payload);

    const { header } = await startRunService(pool, workflow, intentId, runRequest);
    return NextResponse.json(header, { status: 202 });
  } catch (error: unknown) {
    return toRunStartErrorResponse(error, "POST /api/runs");
  }
}
