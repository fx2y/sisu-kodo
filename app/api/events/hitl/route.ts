import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { postExternalEventService } from "@src/server/ui-api";

/**
 * POST /api/events/hitl
 * External receiver webhook for machine-driven events.
 * Extracts WID, gateKey, topic, payload, and dedupeKey.
 */
export async function POST(req: Request) {
  try {
    const { pool, workflow } = await getServices();
    const payload = await req.json();

    await postExternalEventService(pool, workflow, payload);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: unknown) {
    console.error(`[API] POST /api/events/hitl error:`, error);
    const message = error instanceof Error ? error.message : "internal error";
    const status = message.includes("ValidationError") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
