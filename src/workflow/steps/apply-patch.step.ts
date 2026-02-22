import type { CompiledIntent } from "./compile.types";

export type PatchedIntent = CompiledIntent & {
  // Keep shape additive for compat, but do not emit wall-clock fields in replayed step outputs.
  patchedAt?: string;
};

export class ApplyPatchStepImpl {
  async execute(compiled: CompiledIntent): Promise<PatchedIntent> {
    // Identity transform for now; to be expanded in C3/C4 for HITL
    return { ...compiled };
  }
}
