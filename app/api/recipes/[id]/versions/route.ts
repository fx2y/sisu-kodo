import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getRecipeVersionsService } from "@src/server/ui-api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { pool } = await getServices();
    const versions = await getRecipeVersionsService(pool, id);
    return NextResponse.json(versions);
  } catch (error: unknown) {
    console.error(`[API] GET /api/recipes/[id]/versions error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
