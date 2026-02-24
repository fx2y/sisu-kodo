export type RunIdentityDrift = {
  field: string;
  existing: unknown;
  incoming: unknown;
};

export class RunIdentityConflictError extends Error {
  public readonly code = "run_identity_conflict";

  public constructor(
    message: string,
    public readonly drift: RunIdentityDrift[] = []
  ) {
    super(message);
    this.name = "RunIdentityConflictError";
  }
}
