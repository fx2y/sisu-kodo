import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { parseJsonBody } from "@src/server/json-body";
import { ValidationError } from "@src/contracts/assert";
import { canonicalStringify } from "@src/lib/hash";
import { exportBundle } from "@src/db/recipeRepo";
import { assertRecipeExportRequest } from "@src/contracts/recipe.schema";

export async function POST(req: Request) {
  try {
    const { pool } = await getServices();
    const payload = parseJsonBody(await req.text());
    assertRecipeExportRequest(payload);
    const bundle = await exportBundle(pool, payload.id);
    return new NextResponse(canonicalStringify(bundle), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, details: error.errors }, { status: 400 });
    }
    console.error(`[API] POST /api/recipes/export error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
