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
