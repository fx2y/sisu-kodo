export function now(): Date {
  return new Date();
}

export function nowMs(): number {
  return Date.now();
}

export function nowIso(): string {
  return now().toISOString();
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function parseIso(iso: string): number {
  return Date.parse(iso);
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

export function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const seconds = Math.floor(Math.abs(diff) / 1000);
  const suffix = diff > 0 ? "ago" : "from now";

  if (seconds < 60) return `${seconds}s ${suffix}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.floor(hours / 24);
  return `${days}d ${suffix}`;
}

export async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntil(
  predicate: () => Promise<boolean>,
  opts: { timeoutMs: number; intervalMs: number }
): Promise<void> {
  const start = nowMs();
  while (nowMs() - start < opts.timeoutMs) {
    if (await predicate()) {
      return;
    }
    await waitMs(opts.intervalMs);
  }
  throw new Error(`Timeout after ${opts.timeoutMs}ms`);
}
