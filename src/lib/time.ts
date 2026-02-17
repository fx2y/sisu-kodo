export function now(): Date {
  return new Date();
}

export function nowIso(): string {
  return now().toISOString();
}

export async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
