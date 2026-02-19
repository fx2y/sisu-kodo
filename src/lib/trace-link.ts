function trimTrailingSlash(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

function withEncodedTraceId(baseUrl: string, traceId: string): string {
  const normalized = trimTrailingSlash(baseUrl);
  return `${normalized}/${encodeURIComponent(traceId)}`;
}

export function buildTraceUrl(
  traceBaseUrl: string | undefined,
  traceId: string | null | undefined,
  spanId?: string | null
): string | null {
  if (!traceBaseUrl || !traceId) return null;

  if (traceBaseUrl.includes("{traceId}") || traceBaseUrl.includes("{spanId}")) {
    return traceBaseUrl
      .replaceAll("{traceId}", encodeURIComponent(traceId))
      .replaceAll("{spanId}", spanId ? encodeURIComponent(spanId) : "");
  }

  return withEncodedTraceId(traceBaseUrl, traceId);
}
