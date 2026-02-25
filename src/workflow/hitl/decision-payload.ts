type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readString(obj: JsonRecord, key: string): string | null {
  const value = obj[key];
  return typeof value === "string" ? value : null;
}

function normalizeDecisionAlias(value: string): "yes" | "no" | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes" || normalized === "approve" || normalized === "approved") return "yes";
  if (normalized === "no" || normalized === "reject" || normalized === "rejected") return "no";
  return null;
}

export function resolveApprovalChoice(payload: unknown): "yes" | "no" {
  const record = asRecord(payload);
  const choice = readString(record, "choice");
  if (choice === "yes" || choice === "no") return choice;

  if (record.approved === true) return "yes";
  if (record.approved === false) return "no";

  const decision = readString(record, "decision");
  const mapped = decision ? normalizeDecisionAlias(decision) : null;
  return mapped ?? "no";
}

export function resolveApprovalRationale(payload: unknown): string | null {
  const record = asRecord(payload);
  const rationale = readString(record, "rationale");
  if (rationale !== null) return rationale;
  const reason = readString(record, "reason");
  if (reason !== null) return reason;
  const note = readString(record, "note");
  if (note !== null) return note;
  const notes = readString(record, "notes");
  return notes;
}
