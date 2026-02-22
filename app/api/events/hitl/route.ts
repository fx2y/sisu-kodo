import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { postExternalEventService } from "@src/server/ui-api";
import { readJsonBody, toOpsErrorResponse } from "../../ops/wf/route-utils";

/**
 * POST /api/events/hitl
 * External receiver webhook for machine-driven events.
 * Extracts WID, gateKey, topic, payload, and dedupeKey.
 */
export async function POST(req: Request) {
  const routeTag = "POST /api/events/hitl";
  try {
    const { pool, workflow } = await getServices();
    const payload = await readJsonBody(req);

    await postExternalEventService(pool, workflow, payload);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, routeTag);
  }
}
