import { WorkflowError } from "../contracts/error";
import type { StallDetector } from "./stall-detector";

type TimeoutPolicyParams<T> = {
  detector: StallDetector;
  initialPrompt: string;
  stepId: string;
  onAttempt: (prompt: string) => Promise<T>;
  onRetry: () => Promise<void>;
  tightenPrompt: (prompt: string) => string;
};

export async function runWithTimeoutPolicy<T>(params: TimeoutPolicyParams<T>): Promise<T> {
  const execute = async (prompt: string, isRetry: boolean): Promise<T> => {
    try {
      return await params.detector.race(params.onAttempt(prompt));
    } catch (error: unknown) {
      if (!(error instanceof WorkflowError) || error.code !== "oc_stall") {
        throw error;
      }
      if (isRetry) {
        throw new WorkflowError(
          "oc_timeout_terminal",
          `Terminal timeout after retry for ${params.stepId}`
        );
      }
      await params.onRetry();
      return await execute(params.tightenPrompt(prompt), true);
    }
  };

  return await execute(params.initialPrompt, false);
}
