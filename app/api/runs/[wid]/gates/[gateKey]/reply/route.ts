import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { postReplyService } from "@src/server/ui-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wid: string; gateKey: string }> }
) {
  try {
    const { pool, workflow } = await getServices();
    const { wid, gateKey } = await params;
    const body = await request.json();
    await postReplyService(pool, workflow, wid, gateKey, body);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("invalid") || message.includes("must have") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
