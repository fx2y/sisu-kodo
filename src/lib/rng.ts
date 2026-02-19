import crypto from "node:crypto";

let seed = 0x12345678;

export function setRngSeed(nextSeed: number): void {
  seed = nextSeed >>> 0;
}

export function randomSeed(fixedSeed?: number): void {
  if (fixedSeed !== undefined) {
    setRngSeed(fixedSeed);
    return;
  }
  setRngSeed(crypto.randomBytes(4).readUInt32BE());
}

export function rand(): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 2 ** 32;
}
