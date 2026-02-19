import { OCWrapper } from "../src/oc/wrapper";
import { getConfig } from "../src/config";

async function main(): Promise<void> {
  const cfg = getConfig();
  // Force live mode for smoke test
  const oc = new OCWrapper({ ...cfg, ocMode: "live" });

  console.log(`oc-live-smoke starting (baseUrl=${cfg.ocBaseUrl})`);

  try {
    // 1. Health check
    await oc.health();

    // 2. Simple live call: list agents
    const agents = await oc.agents();
    console.log(`oc-live-smoke success: agents=[${agents.join(", ")}]`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isStrict = process.env.OC_STRICT_MODE === "1" || process.env.OC_STRICT_MODE === "true";

    if (
      !isStrict &&
      (message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("401"))
    ) {
      console.warn(`oc-live-smoke skipped: provider credentials missing or invalid`);
      return;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
