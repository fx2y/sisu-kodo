import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getRunHeaderService } from "@src/server/ui-api";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  try {
    const { pool, workflow } = await getServices();
    const { wid } = await params;

    const header = await getRunHeaderService(pool, workflow, wid);
    if (!header) {
      return NextResponse.json({ error: "run not found" }, { status: 404 });
    }
    return NextResponse.json(header, { status: 200 });
  } catch (error: unknown) {
    console.error(`[API] GET /api/runs/:wid error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
