import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { startRunService } from "@src/server/ui-api";
import { ValidationError } from "@src/contracts/assert";
import { QueuePolicyError } from "@src/workflow/queue-policy";

export async function POST(req: Request) {
  try {
    const { pool, workflow } = await getServices();
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return NextResponse.json({ error: "invalid json payload" }, { status: 400 });
    }

    const { intentId, ...runRequest } = payload as Record<string, unknown>;
    if (typeof intentId !== "string" || intentId.length === 0) {
      return NextResponse.json({ error: "intentId required" }, { status: 400 });
    }

    const { header } = await startRunService(pool, workflow, intentId, runRequest);
    return NextResponse.json(header, { status: 202 });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, details: error.errors }, { status: 400 });
    }
    if (error instanceof QueuePolicyError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Intent not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error(`[API] POST /api/runs error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
