import {
  assertSignoffBoardResponse,
  type SignoffBoardResponse
} from "../contracts/ui/signoff-board.schema";

export class SignoffClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly kind: "http" | "parse" = "http"
  ) {
    super(message);
    this.name = "SignoffClientError";
  }
}

async function parseJsonBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new SignoffClientError("signoff_response_json_parse_failed", res.status, "parse");
  }
}

export async function loadSignoffBoard(fetchImpl: typeof fetch = fetch): Promise<SignoffBoardResponse> {
  const res = await fetchImpl("/api/ops/signoff");
  if (!res.ok) {
    try {
      const payload = (await res.json()) as Record<string, unknown>;
      const message =
        typeof payload.error === "string"
          ? payload.error
          : typeof payload.message === "string"
            ? payload.message
            : `signoff_request_failed:${res.status}`;
      throw new SignoffClientError(message, res.status, "http");
    } catch (error) {
      if (error instanceof SignoffClientError) throw error;
      throw new SignoffClientError(`signoff_request_failed:${res.status}`, res.status, "http");
    }
  }
  const payload = await parseJsonBody(res);
  try {
    assertSignoffBoardResponse(payload);
  } catch {
    throw new SignoffClientError("signoff_payload_invalid", res.status, "parse");
  }
  return payload;
}
