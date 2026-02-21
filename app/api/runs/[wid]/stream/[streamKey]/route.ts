import { getServices } from "@src/server/singleton";
import { getStreamService } from "@src/server/ui-api";

type Props = {
  params: Promise<{ wid: string; streamKey: string }>;
};

/**
 * GET /api/runs/:wid/stream/:streamKey
 * Returns a live NDJSON stream of the requested DBOS stream.
 * Reconnect semantics handled by the client (UI).
 */
export async function GET(_req: Request, { params }: Props) {
  try {
    const { workflow } = await getServices();
    const { wid, streamKey } = await params;

    const stream = getStreamService(workflow, wid, streamKey);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            // Encode each chunk as a line in NDJSON format
            const data = JSON.stringify(chunk) + "\n";
            controller.enqueue(encoder.encode(data));
          }
          controller.close();
        } catch (error) {
          console.error(`[API] stream [${wid}/${streamKey}] error:`, error);
          controller.error(error);
        }
      },
      cancel() {
        // DBOS.readStream should handle termination when the iterator is abandoned.
      }
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no" // Disable buffering for Nginx
      }
    });
  } catch (error: unknown) {
    console.error(`[API] GET /api/runs/:wid/stream/:streamKey setup error:`, error);
    return new Response(JSON.stringify({ error: "failed to setup stream" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
