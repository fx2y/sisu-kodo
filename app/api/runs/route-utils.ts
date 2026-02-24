import { NextResponse } from "next/server";
import { ValidationError } from "@src/contracts/assert";
import { QueuePolicyError } from "@src/workflow/queue-policy";
import { OpsConflictError, OpsNotFoundError } from "@src/server/ops-api";
import { RunIdentityConflictError } from "@src/lib/run-identity-conflict";

export function toRunStartErrorResponse(error: unknown, routeTag: string): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message, details: error.errors }, { status: 400 });
  }
  if (error instanceof QueuePolicyError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof OpsNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof RunIdentityConflictError) {
    return NextResponse.json({ error: error.message, drift: error.drift }, { status: 409 });
  }
  if (error instanceof OpsConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message.includes("Intent not found")) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error(`[API] ${routeTag} error:`, error);
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}
