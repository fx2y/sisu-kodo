import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import {
  assertListWorkflowsQuery,
  assertListWorkflowsResponse
} from "@src/contracts/ops/list.schema";
import { listWorkflows } from "@src/server/ops-api";
import { parseListQuery, toOpsErrorResponse } from "./route-utils";

export async function GET(req: Request) {
  try {
    const { workflow } = await getServices();
    const query = parseListQuery(req.url);
    assertListWorkflowsQuery(query);
    const out = await listWorkflows(workflow, query);
    assertListWorkflowsResponse(out);
    return NextResponse.json(out, { status: 200 });
  } catch (error: unknown) {
    return toOpsErrorResponse(error, "GET /api/ops/wf");
  }
}
