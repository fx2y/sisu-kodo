import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getReproSnapshotService } from "@src/server/ui-api";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  try {
    const { pool, sysPool } = await getServices();
    const { wid } = await params;

    const snapshot = await getReproSnapshotService(pool, sysPool, wid);
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error: unknown) {
    console.error(`[API] GET /api/runs/:wid/repro error:`, error);
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "run not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
