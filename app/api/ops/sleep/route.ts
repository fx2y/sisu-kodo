import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";

export async function POST(req: Request) {
  const { workflow, pool } = await getServices();
  const { searchParams } = new URL(req.url);
  const wid = searchParams.get("wf");
  const sleepMs = Number(searchParams.get("sleep") ?? "5000");

  if (!wid) {
    return NextResponse.json({ error: "wf query param required" }, { status: 400 });
  }

  // G07.S1.04: satisfying FK requirements for artifacts in utility workflows
  const intentId = `it-utility-${wid}`;
  await pool.query(
    "INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [intentId, "utility-sleep", JSON.stringify({ inputs: {}, constraints: {} })]
  );
  await pool.query(
    "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    [wid, intentId, wid, "running"]
  );

  await workflow.startSleepWorkflow(wid, sleepMs);
  return NextResponse.json({ accepted: true, workflowID: wid }, { status: 202 });
}
