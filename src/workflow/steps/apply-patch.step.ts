import type { CompiledIntent } from "./compile.types";
import { nowIso } from "../../lib/time";

export type PatchedIntent = CompiledIntent & {
  patchedAt?: string;
};

export class ApplyPatchStepImpl {
  async execute(compiled: CompiledIntent): Promise<PatchedIntent> {
    // Identity transform for now; to be expanded in C3/C4 for HITL
    return {
      ...compiled,
      patchedAt: nowIso()
    };
  }
}
