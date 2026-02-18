import { waitUntil } from "../lib/time";
import type { OCWrapper } from "./wrapper";

export async function waitForOCDaemon(wrapper: OCWrapper, timeoutMs = 20000): Promise<void> {
  console.log("Waiting for OpenCode daemon health...");
  try {
    await waitUntil(
      async () => {
        try {
          await wrapper.health();
          return true;
        } catch {
          return false;
        }
      },
      { timeoutMs, intervalMs: 500 }
    );
    console.log("OpenCode daemon is healthy.");
  } catch (err) {
    throw new Error(
      `OpenCode daemon failed health check: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
