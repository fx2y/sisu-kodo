import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";

export async function POST(req: Request) {
  const { workflow } = await getServices();
  const { searchParams } = new URL(req.url);
  const wid = searchParams.get("wf");
  const sleepMs = Number(searchParams.get("sleep") ?? "5000");

  if (!wid) {
    return NextResponse.json({ error: "wf query param required" }, { status: 400 });
  }

  await workflow.startSleepWorkflow(wid, sleepMs);
  return NextResponse.json({ accepted: true, workflowID: wid }, { status: 202 });
}
