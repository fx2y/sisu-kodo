import type { OCOutput } from "./schema";

export class OCWrapperCache {
  private readonly cache = new Map<string, OCOutput>();

  get(opKey: string): OCOutput | undefined {
    return this.cache.get(opKey);
  }

  set(opKey: string, output: OCOutput): void {
    this.cache.set(opKey, output);
  }

  clear(): void {
    this.cache.clear();
  }
}
