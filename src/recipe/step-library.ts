import { ValidationError } from "../contracts/assert";

export const STEP_LIBRARY_PRIMITIVES = [
  "Collect",
  "Fetch",
  "Extract",
  "Normalize",
  "Decide",
  "Act",
  "Report"
] as const;

export type StepLibraryPrimitive = (typeof STEP_LIBRARY_PRIMITIVES)[number];

export type StepLibrarySpec = {
  primitives: StepLibraryPrimitive[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toPrimitiveList(value: unknown): StepLibraryPrimitive[] | null {
  if (!Array.isArray(value)) return null;
  const out: StepLibraryPrimitive[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !STEP_LIBRARY_PRIMITIVES.includes(item as StepLibraryPrimitive)) {
      return null;
    }
    out.push(item as StepLibraryPrimitive);
  }
  return out;
}

export function defaultStepLibrarySpec(): StepLibrarySpec {
  return { primitives: [...STEP_LIBRARY_PRIMITIVES] };
}

export function resolveStepLibrarySpec(constraints: Record<string, unknown>): StepLibrarySpec {
  const stepLibrary = asRecord(constraints.stepLibrary);
  if (!stepLibrary) return defaultStepLibrarySpec();

  const parsed = toPrimitiveList(stepLibrary.primitives);
  if (!parsed || parsed.length === 0) {
    throw new ValidationError([], "constraints.stepLibrary.primitives must be a non-empty canonical list");
  }
  return { primitives: parsed };
}

