import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { startRunFromRecipeService } from "@src/server/ui-api";
import { ValidationError } from "@src/contracts/assert";
import { QueuePolicyError } from "@src/workflow/queue-policy";
import { OpsNotFoundError } from "@src/server/ops-api";
import { parseJsonBody } from "@src/server/json-body";

export async function POST(req: Request) {
  try {
    const { pool, workflow } = await getServices();
    const payload = parseJsonBody(await req.text());
    const { header } = await startRunFromRecipeService(pool, workflow, payload);
    return NextResponse.json(header, { status: 202 });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, details: error.errors }, { status: 400 });
    }
    if (error instanceof QueuePolicyError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof OpsNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message.includes("Intent not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error(`[API] POST /api/run error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
