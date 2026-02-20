import { NextResponse } from "next/server";
import { ValidationError } from "@src/contracts/assert";
import { OpsConflictError, OpsNotFoundError } from "@src/server/ops-api";

export async function readJsonBody(req: Request): Promise<unknown> {
  const rawBody = await req.text();
  if (rawBody.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ValidationError([], "invalid json");
  }
}

export function parseListQuery(url: string): Record<string, unknown> {
  const params = new URL(url).searchParams;
  const query: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    query[key] = key === "limit" ? Number(value) : value;
  }
  return query;
}

export function toOpsErrorResponse(error: unknown, routeTag: string): NextResponse {
  if (error instanceof ValidationError) {
    if (error.message === "invalid json") {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message, details: error.errors }, { status: 400 });
  }
  if (error instanceof OpsNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof OpsConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error(`[API] ${routeTag} error:`, error);
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}
