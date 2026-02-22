import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { createIntentService } from "@src/server/ui-api";
import { ValidationError } from "@src/contracts/assert";
import { QueuePolicyError } from "@src/workflow/queue-policy";
import { parseJsonBody } from "@src/server/json-body";

export async function POST(req: Request) {
  try {
    const { pool } = await getServices();
    const body = parseJsonBody(await req.text());
    const result = await createIntentService(pool, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, details: error.errors }, { status: 400 });
    }
    if (error instanceof QueuePolicyError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    console.error(`[API] POST /api/intents error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
