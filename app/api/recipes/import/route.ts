import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { parseJsonBody } from "@src/server/json-body";
import { ValidationError } from "@src/contracts/assert";
import { assertRecipeBundle } from "@src/contracts/recipe.schema";
import { importBundle } from "@src/db/recipeRepo";

export async function POST(req: Request) {
  try {
    const { pool } = await getServices();
    const payload = parseJsonBody(await req.text());
    assertRecipeBundle(payload);
    const rows = await importBundle(pool, payload);
    return NextResponse.json(
      {
        id: payload.id,
        versions: rows.map((row) => ({ id: row.id, v: row.v, hash: row.hash, status: row.status }))
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, details: error.errors }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("immutable")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error(`[API] POST /api/recipes/import error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
