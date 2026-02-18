export type ErrorEnvelope = {
  error: string;
  details?: unknown;
};

export class StructuredOutputError extends Error {
  constructor(
    public readonly message: string,
    public readonly attempts: number,
    public readonly raw: unknown,
    public readonly schemaHash: string
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}
