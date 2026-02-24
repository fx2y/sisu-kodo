import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getRecipeOverviewsService } from "@src/server/ui-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { pool } = await getServices();
    const overviews = await getRecipeOverviewsService(pool);
    return NextResponse.json(overviews);
  } catch (error: unknown) {
    console.error(`[API] GET /api/recipes error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
