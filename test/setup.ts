import { Agent, MockAgent, setGlobalDispatcher } from "undici";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

import { setRngSeed } from "../src/lib/rng";

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

let restoreDispatcher: Agent | undefined;

beforeAll(() => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  mock.enableNetConnect(/127\.0\.0\.1|localhost/);
  restoreDispatcher = new Agent();
  setGlobalDispatcher(mock);
});

afterAll(() => {
  if (restoreDispatcher) {
    setGlobalDispatcher(restoreDispatcher);
  }
});

beforeEach((context) => {
  let baseSeed = Number(process.env.TEST_SEED ?? "424242");
  if (process.env.TEST_SUITE === "e2e") {
    baseSeed += process.pid;
  }
  const testHash = context.task ? hashString(context.task.name) : 0;
  setRngSeed(baseSeed + testHash);

  if (process.env.TEST_SUITE === "unit") {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
  }
});

afterEach(() => {
  if (process.env.TEST_SUITE === "unit") {
    vi.useRealTimers();
  }
});
