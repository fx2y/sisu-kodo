const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

export function normalizeForSnapshot(input: string): string {
  return input.replaceAll("\\", "/").replace(ISO_RE, "<ISO_TS>").replace(UUID_RE, "<UUID>");
}
