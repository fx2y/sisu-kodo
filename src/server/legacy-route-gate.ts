import type { ServerResponse } from "node:http";
import { NextResponse } from "next/server";

const LEGACY_SUNSET = "Tue, 30 Jun 2026 23:59:59 GMT";

export function writeLegacyDeprecationHeaders(res: ServerResponse): void {
  res.setHeader("Deprecation", "true");
  res.setHeader("Sunset", LEGACY_SUNSET);
}

export function applyLegacyDeprecationHeaders(res: NextResponse): NextResponse {
  res.headers.set("Deprecation", "true");
  res.headers.set("Sunset", LEGACY_SUNSET);
  return res;
}

export function legacyRouteDisabledResponse(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 410 });
}
