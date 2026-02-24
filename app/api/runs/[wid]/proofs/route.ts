import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getProofCardsService } from "@src/server/ui-api";

type Props = {
  params: Promise<{ wid: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  try {
    const { pool, workflow } = await getServices();
    const { wid } = await params;

    const cards = await getProofCardsService(pool, workflow, wid);
    return NextResponse.json(cards, { status: 200 });
  } catch (error: unknown) {
    console.error(`[API] GET /api/runs/:wid/proofs error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
