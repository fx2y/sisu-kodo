import { NextResponse } from "next/server";
import { createPool } from "../../../../src/db/pool";
import { getConfig } from "../../../../src/config";
import { getSignoffBoardService } from "../../../../src/server/signoff-api";
import { assertSignoffBoardResponse } from "../../../../src/contracts/ui/signoff-board.schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getConfig();
  const appPool = createPool(cfg.appDbName);
  const sysPool = createPool(cfg.sysDbName);

  try {
    const data = await getSignoffBoardService(appPool, sysPool);
    assertSignoffBoardResponse(data);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await Promise.allSettled([appPool.end(), sysPool.end()]);
  }
}
