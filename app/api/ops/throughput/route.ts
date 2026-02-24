import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { listThroughput } from "@src/server/ops-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { pool, sysPool } = await getServices();
    const throughput = await listThroughput(pool, sysPool);
    return NextResponse.json(throughput);
  } catch (error) {
    console.error("[api/ops/throughput] error:", error);
    const message = error instanceof Error ? error.message : "internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
