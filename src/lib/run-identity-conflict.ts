export class RunIdentityConflictError extends Error {
  public readonly code = "run_identity_conflict";

  public constructor(message: string) {
    super(message);
    this.name = "RunIdentityConflictError";
  }
}
